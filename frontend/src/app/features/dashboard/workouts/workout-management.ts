import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  CreateWorkoutPayload,
  Exercise,
  UpdateWorkoutPayload,
  Workout,
  WorkoutService,
  WorkoutStatus,
} from '../../../core/services/workout.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/auth.models';

type ModalMode = 'add' | 'edit' | 'view' | 'delete' | null;

@Component({
  selector: 'app-workout-management',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './workout-management.html',
  styleUrl: './workout-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutManagement implements OnInit {
  private readonly workoutService = inject(WorkoutService);
  private readonly userService = inject(UserService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly workouts = signal<Workout[]>([]);
  protected readonly members = signal<User[]>([]);
  protected readonly trainers = signal<User[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly usersLoading = signal(false);
  protected readonly selectedMemberTrainerName = signal<string | null>(null);

  protected readonly modalMode = signal<ModalMode>(null);
  protected readonly selectedWorkout = signal<Workout | null>(null);

  // Filters
  protected readonly searchValue = signal('');
  protected readonly statusFilter = signal('');
  protected readonly categoryFilter = signal('');
  protected readonly filteredMemberId = signal<string | null>(null);
  protected readonly filteredMemberName = signal<string | null>(null);

  protected readonly userRole = this.authService.userRole;
  protected readonly currentUser = this.authService.currentUser;

  // Pending action to open assign modal once users have loaded
  private pendingOpenAddMemberId: string | undefined | null = undefined;
  private usersLoaded = false;

  // Progress metrics computed
  protected readonly totalWorkouts = computed(() => this.workouts().length);
  protected readonly completedWorkouts = computed(
    () => this.workouts().filter((w) => w.status === 'completed').length,
  );
  protected readonly completionRate = computed(() => {
    const total = this.totalWorkouts();
    if (total === 0) return 0;
    return Math.round((this.completedWorkouts() / total) * 100);
  });
  protected readonly inProgressWorkouts = computed(
    () => this.workouts().filter((w) => w.status === 'in-progress').length,
  );

  // Workout Form
  protected readonly workoutForm = new FormGroup({
    workoutName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(1000)],
    }),
    category: new FormControl('Strength', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    duration: new FormControl<number>(45, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    schedule: new FormControl('', { nonNullable: true }),
    assignedMember: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    assignedTrainer: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    status: new FormControl<WorkoutStatus>('assigned', { nonNullable: true }),
    exercises: new FormArray<
      FormGroup<{
        name: FormControl<string>;
        sets: FormControl<number>;
        reps: FormControl<number>;
        weight: FormControl<string>;
      }>
    >([]),
  });

  ngOnInit(): void {
    if (this.userRole() === 'admin' || this.userRole() === 'trainer') {
      this.loadUsers();
    }

    // Subscribe to assignedMember changes so selecting a member updates the assigned trainer
    this.workoutForm.controls.assignedMember.valueChanges.subscribe((memberId) => {
      this.onMemberSelected(memberId);
    });

    this.route.queryParamMap.subscribe((params) => {
      const mId = params.get('memberId');
      const mName = params.get('memberName');
      const action = params.get('action');

      this.filteredMemberId.set(mId);
      this.filteredMemberName.set(mName);

      this.loadWorkouts();

      if (action === 'assign') {
        // If users are already loaded, open immediately; otherwise defer until loaded
        if (this.usersLoaded) {
          this.openAdd(mId || undefined);
        } else {
          this.pendingOpenAddMemberId = mId;
        }
      }
    });
  }

  protected loadWorkouts(): void {
    this.loading.set(true);
    this.error.set(null);
    const filters: {
      search?: string;
      status?: string;
      category?: string;
      memberId?: string;
    } = {
      search: this.searchValue(),
      status: this.statusFilter(),
      category: this.categoryFilter(),
      memberId: this.filteredMemberId() || undefined,
    };

    this.workoutService.getWorkouts(filters).subscribe({
      next: (data) => {
        this.workouts.set(data);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to load workouts.');
        this.loading.set(false);
      },
    });
  }

  protected clearMemberFilter(): void {
    this.filteredMemberId.set(null);
    this.filteredMemberName.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { memberId: null, memberName: null, action: null },
      queryParamsHandling: 'merge',
    });
    this.loadWorkouts();
  }

  protected loadUsers(): void {
    this.usersLoading.set(true);

    if (this.userRole() === 'trainer') {
      // Trainers can only assign workouts to their assigned members (per S14 security rules)
      // and cannot query the admin-only GET /api/users endpoint.
      this.userService.getTrainerOverview().subscribe({
        next: (overview) => {
          const assigned = (overview.assignedMembers || []).map(
            (m) =>
              ({
                _id: m._id,
                fullName: m.fullName,
                email: m.email,
                phone: m.phone || '',
                gender: (m.gender as any) || 'other',
                role: 'member',
                assignedTrainer: this.currentUser() || this.currentUser()?._id || null,
              }) as User,
          );
          this.members.set(assigned);
          if (this.currentUser()) {
            this.trainers.set([this.currentUser()!]);
          }
          this.usersLoading.set(false);
          this.usersLoaded = true;
          // Open add modal now if one was deferred
          if (this.pendingOpenAddMemberId !== undefined) {
            this.openAdd(this.pendingOpenAddMemberId || undefined);
            this.pendingOpenAddMemberId = undefined;
          }
        },
        error: (err: HttpErrorResponse) => {
          this.usersLoading.set(false);
          this.usersLoaded = true;
          this.error.set(err?.error?.message ?? 'Failed to load assigned members.');
        },
      });
    } else {
      // Admin: can fetch all users and trainers
      this.userService.getUsers().subscribe({
        next: (users) => {
          this.members.set(users.filter((u) => u.role === 'member'));
          this.trainers.set(users.filter((u) => u.role === 'trainer'));
          this.usersLoading.set(false);
          this.usersLoaded = true;
          // Open add modal now if one was deferred
          if (this.pendingOpenAddMemberId !== undefined) {
            this.openAdd(this.pendingOpenAddMemberId || undefined);
            this.pendingOpenAddMemberId = undefined;
          }
        },
        error: (err: HttpErrorResponse) => {
          this.usersLoading.set(false);
          this.usersLoaded = true;
          this.error.set(err?.error?.message ?? 'Failed to load members.');
        },
      });
    }
  }

  protected onSearchChange(event: Event): void {
    this.searchValue.set((event.target as HTMLInputElement).value);
    this.loadWorkouts();
  }

  protected onStatusChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
    this.loadWorkouts();
  }

  protected onCategoryChange(event: Event): void {
    this.categoryFilter.set((event.target as HTMLSelectElement).value);
    this.loadWorkouts();
  }

  /**
   * Called when the assigned member dropdown changes via user interaction.
   */
  protected onMemberSelectChange(event: Event): void {
    const memberId = (event.target as HTMLSelectElement).value;
    this.onMemberSelected(memberId);
  }

  /**
   * Internal handler when a member is selected.
   * Auto-selects and displays the corresponding assigned trainer.
   */
  protected onMemberSelected(memberId: string): void {
    if (!memberId) {
      this.selectedMemberTrainerName.set(null);
      if (this.userRole() !== 'trainer') {
        this.workoutForm.controls.assignedTrainer.setValue('');
      }
      return;
    }

    const member = this.members().find((m) => m._id === memberId);
    if (!member) {
      this.selectedMemberTrainerName.set(null);
      return;
    }

    if (this.userRole() === 'trainer') {
      // Trainer assigns to their own member
      this.selectedMemberTrainerName.set(this.currentUser()?.fullName ?? 'You');
      this.workoutForm.controls.assignedTrainer.setValue(this.currentUser()?._id ?? '');
      return;
    }

    // Admin role: check if member has an assigned trainer
    if (member.assignedTrainer) {
      const trainerId =
        typeof member.assignedTrainer === 'object' && member.assignedTrainer !== null
          ? (member.assignedTrainer as any)._id
          : String(member.assignedTrainer);

      const trainerObj =
        typeof member.assignedTrainer === 'object' && member.assignedTrainer !== null
          ? (member.assignedTrainer as any)
          : this.trainers().find((t) => t._id === trainerId);

      const trainerName = trainerObj?.fullName || 'Assigned Trainer';

      if (trainerId) {
        this.workoutForm.controls.assignedTrainer.setValue(trainerId);
        this.selectedMemberTrainerName.set(trainerName);
      }
    } else {
      // Member has no assigned trainer yet
      this.selectedMemberTrainerName.set(null);
    }
  }

  // Dynamic Exercises
  get exerciseFormArray() {
    return this.workoutForm.controls.exercises;
  }

  protected addExercise(name = '', sets = 3, reps = 10, weight = ''): void {
    const group = new FormGroup({
      name: new FormControl(name, { nonNullable: true, validators: [Validators.required] }),
      sets: new FormControl(sets, { nonNullable: true, validators: [Validators.min(1)] }),
      reps: new FormControl(reps, { nonNullable: true, validators: [Validators.min(1)] }),
      weight: new FormControl(weight, { nonNullable: true }),
    });
    this.exerciseFormArray.push(group);
  }

  protected removeExercise(index: number): void {
    this.exerciseFormArray.removeAt(index);
  }

  // Modals
  protected openAdd(preselectedMemberId?: string): void {
    const memberId = preselectedMemberId || this.filteredMemberId() || '';
    const trainerId = this.userRole() === 'trainer' ? (this.currentUser()?._id ?? '') : '';

    this.workoutForm.reset({
      workoutName: '',
      description: '',
      category: 'Strength',
      duration: 45,
      schedule: 'Mon, Wed, Fri - 8:00 AM',
      assignedMember: memberId,
      assignedTrainer: trainerId,
      status: 'assigned',
    });
    this.exerciseFormArray.clear();
    this.addExercise('Barbell Squat', 3, 10, '60 kg');
    this.addExercise('Bench Press', 3, 10, '50 kg');
    this.addExercise('Deadlift', 3, 8, '80 kg');

    if (memberId) {
      this.onMemberSelected(memberId);
    } else {
      this.selectedMemberTrainerName.set(null);
    }

    this.error.set(null);
    this.success.set(null);
    this.modalMode.set('add');
  }

  protected openEdit(workout: Workout): void {
    this.selectedWorkout.set(workout);
    this.error.set(null);
    this.success.set(null);

    this.workoutForm.reset({
      workoutName: workout.workoutName,
      description: workout.description,
      category: workout.category,
      duration: workout.duration,
      schedule: workout.schedule || '',
      assignedMember: workout.assignedMember?._id || '',
      assignedTrainer: workout.assignedTrainer?._id || '',
      status: workout.status,
    });

    this.selectedMemberTrainerName.set(workout.assignedTrainer?.fullName || null);

    this.exerciseFormArray.clear();
    if (workout.exercises && workout.exercises.length > 0) {
      workout.exercises.forEach((ex) => this.addExercise(ex.name, ex.sets, ex.reps, ex.weight));
    } else {
      this.addExercise();
    }

    this.modalMode.set('edit');
  }

  protected openView(workout: Workout): void {
    this.selectedWorkout.set(workout);
    this.modalMode.set('view');
  }

  protected openDelete(workout: Workout): void {
    this.selectedWorkout.set(workout);
    this.error.set(null);
    this.modalMode.set('delete');
  }

  protected closeModal(): void {
    this.modalMode.set(null);
    this.selectedWorkout.set(null);
    this.selectedMemberTrainerName.set(null);
  }

  // Actions
  protected setWorkoutStatus(workout: Workout, status: WorkoutStatus, event?: Event): void {
    if (event) event.stopPropagation();

    this.workoutService.updateWorkoutStatus(workout._id, status).subscribe({
      next: (updated) => {
        this.workouts.update((list) =>
          list.map((w) => (w._id === updated._id ? updated : w)),
        );
        this.success.set(`Workout "${updated.workoutName}" updated to ${status}.`);
        setTimeout(() => this.success.set(null), 3000);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to update workout status.');
      },
    });
  }

  protected submitWorkout(): void {
    this.error.set(null);
    if (this.workoutForm.invalid) {
      this.workoutForm.markAllAsTouched();
      return;
    }

    const val = this.workoutForm.getRawValue();
    const exercises: Exercise[] = val.exercises.map((e) => ({
      name: e.name,
      sets: Number(e.sets),
      reps: Number(e.reps),
      weight: e.weight,
    }));

    this.submitting.set(true);

    if (this.modalMode() === 'add') {
      const payload: CreateWorkoutPayload = {
        workoutName: val.workoutName,
        description: val.description,
        category: val.category,
        duration: Number(val.duration),
        schedule: val.schedule,
        exercises,
        assignedMember: val.assignedMember,
        assignedTrainer:
          this.userRole() === 'trainer' ? this.currentUser()!._id : val.assignedTrainer,
      };

      this.workoutService.createWorkout(payload).subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeModal();
          this.success.set('Workout routine created successfully.');
          this.loadWorkouts();
          setTimeout(() => this.success.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(err?.error?.message ?? 'Failed to create workout.');
        },
      });
    } else if (this.modalMode() === 'edit' && this.selectedWorkout()) {
      const payload: UpdateWorkoutPayload = {
        workoutName: val.workoutName,
        description: val.description,
        category: val.category,
        duration: Number(val.duration),
        schedule: val.schedule,
        exercises,
        status: val.status,
        assignedMember: val.assignedMember,
        assignedTrainer: val.assignedTrainer,
      };

      this.workoutService.updateWorkout(this.selectedWorkout()!._id, payload).subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeModal();
          this.success.set('Workout routine updated successfully.');
          this.loadWorkouts();
          setTimeout(() => this.success.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(err?.error?.message ?? 'Failed to update workout.');
        },
      });
    }
  }

  protected confirmDelete(): void {
    const workout = this.selectedWorkout();
    if (!workout) return;

    this.submitting.set(true);
    this.workoutService.deleteWorkout(workout._id).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('Workout routine deleted successfully.');
        this.loadWorkouts();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to delete workout.');
      },
    });
  }

  // Helpers
  protected getInitials(name: string): string {
    return (name || '')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  protected getStatusBadgeClass(status: string): string {
    if (status === 'completed') return 'badge badge-paid';
    if (status === 'in-progress') return 'badge badge-pending';
    return 'badge badge-member';
  }

  protected isInvalid(field: string): boolean {
    const c = this.workoutForm.get(field);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }
}
