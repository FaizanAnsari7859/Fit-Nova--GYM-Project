import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
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
  protected readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly workouts = signal<Workout[]>([]);
  protected readonly members = signal<User[]>([]);
  protected readonly trainers = signal<User[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly modalMode = signal<ModalMode>(null);
  protected readonly selectedWorkout = signal<Workout | null>(null);

  // Filters
  protected readonly searchValue = signal('');
  protected readonly statusFilter = signal('');
  protected readonly categoryFilter = signal('');

  protected readonly userRole = this.authService.userRole;
  protected readonly currentUser = this.authService.currentUser;

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
    this.loadWorkouts();
    if (this.userRole() === 'admin' || this.userRole() === 'trainer') {
      this.loadUsers();
    }
  }

  protected loadWorkouts(): void {
    this.loading.set(true);
    this.error.set(null);
    const filters = {
      search: this.searchValue(),
      status: this.statusFilter(),
      category: this.categoryFilter(),
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

  protected loadUsers(): void {
    this.userService.getUsers().subscribe({
      next: (users) => {
        this.members.set(users.filter((u) => u.role === 'member'));
        this.trainers.set(users.filter((u) => u.role === 'trainer'));
      },
      error: () => {},
    });
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
  protected openAdd(): void {
    this.workoutForm.reset({
      workoutName: '',
      description: '',
      category: 'Strength',
      duration: 45,
      schedule: 'Mon, Wed, Fri - 8:00 AM',
      assignedMember: '',
      assignedTrainer: this.userRole() === 'trainer' ? (this.currentUser()?._id ?? '') : '',
      status: 'assigned',
    });
    this.exerciseFormArray.clear();
    this.addExercise('Barbell Squat', 3, 10, '60 kg');
    this.addExercise('Bench Press', 3, 10, '50 kg');
    this.addExercise('Deadlift', 3, 8, '80 kg');

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
      assignedMember: workout.assignedMember._id,
      assignedTrainer: workout.assignedTrainer._id,
      status: workout.status,
    });

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

