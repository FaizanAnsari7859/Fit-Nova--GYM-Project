import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AssignedMemberSummary,
  TrainerActivityItem,
  TrainerOverview,
  UserService,
} from '../../../core/services/user.service';
import {
  CreateWorkoutPayload,
  WorkoutService,
} from '../../../core/services/workout.service';
import { AuthService } from '../../../core/services/auth.service';

type MemberFilter = 'all' | 'active' | 'completed' | 'needs-workout';
type ActivityFilter =
  | 'all'
  | 'workout_assigned'
  | 'workout_completed'
  | 'member_assigned';

@Component({
  selector: 'app-trainer-dashboard',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './trainer-dashboard.html',
  styleUrl: './trainer-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainerDashboard implements OnInit {
  private readonly userService = inject(UserService);
  private readonly workoutService = inject(WorkoutService);
  private readonly authService = inject(AuthService);
  protected readonly router = inject(Router);

  protected readonly currentUser = this.authService.currentUser;

  // State signals
  protected readonly loading = signal(true);
  protected readonly overview = signal<TrainerOverview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  // Filters
  protected readonly memberSearch = signal('');
  protected readonly memberFilter = signal<MemberFilter>('all');
  protected readonly activityFilter = signal<ActivityFilter>('all');

  // Quick Assign Modal state
  protected readonly showAssignModal = signal(false);
  protected readonly submittingWorkout = signal(false);
  protected readonly modalError = signal<string | null>(null);

  // Quick Assign Form
  protected readonly assignForm = new FormGroup({
    assignedMember: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    workoutName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    category: new FormControl('Strength', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    duration: new FormControl<number>(45, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    schedule: new FormControl('Mon, Wed, Fri - 8:00 AM', { nonNullable: true }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(1000)],
    }),
    exercises: new FormArray<
      FormGroup<{
        name: FormControl<string>;
        sets: FormControl<number>;
        reps: FormControl<number>;
        weight: FormControl<string>;
      }>
    >([]),
  });

  // Filtered members computed
  protected readonly filteredMembers = computed(() => {
    const data = this.overview()?.assignedMembers ?? [];
    const search = this.memberSearch().trim().toLowerCase();
    const filter = this.memberFilter();

    return data.filter((m) => {
      // Search matching
      if (search) {
        const nameMatch = m.fullName.toLowerCase().includes(search);
        const emailMatch = m.email.toLowerCase().includes(search);
        const phoneMatch = m.phone ? m.phone.toLowerCase().includes(search) : false;
        if (!nameMatch && !emailMatch && !phoneMatch) {
          return false;
        }
      }

      // Filter matching
      if (filter === 'active') {
        return m.activeWorkoutsCount > 0;
      }
      if (filter === 'completed') {
        return m.completionRate === 100 && m.assignedWorkoutsCount > 0;
      }
      if (filter === 'needs-workout') {
        return m.assignedWorkoutsCount === 0;
      }
      return true;
    });
  });

  // Filtered activities computed
  protected readonly filteredActivities = computed(() => {
    const acts = this.overview()?.recentActivities ?? [];
    const filter = this.activityFilter();
    if (filter === 'all') {
      return acts;
    }
    return acts.filter((a) => a.type === filter);
  });

  ngOnInit(): void {
    this.loadOverview();
  }

  protected loadOverview(): void {
    this.loading.set(true);
    this.error.set(null);

    this.userService.getTrainerOverview().subscribe({
      next: (data) => {
        this.overview.set(data);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(
          err?.error?.message ?? 'Failed to load trainer overview data.',
        );
        this.loading.set(false);
      },
    });
  }

  // Filter actions
  protected onSearchChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.memberSearch.set(val);
  }

  protected setMemberFilter(filter: MemberFilter): void {
    this.memberFilter.set(filter);
  }

  protected setActivityFilter(filter: ActivityFilter): void {
    this.activityFilter.set(filter);
  }

  // Navigation
  protected viewMemberProgress(member: AssignedMemberSummary): void {
    this.router.navigate(['/dashboard/workouts'], {
      queryParams: {
        memberId: member._id,
        memberName: member.fullName,
      },
    });
  }

  // Quick Workout Assignment Modal
  get exerciseFormArray() {
    return this.assignForm.controls.exercises;
  }

  protected addExercise(
    name = '',
    sets = 3,
    reps = 10,
    weight = '',
  ): void {
    const group = new FormGroup({
      name: new FormControl(name, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      sets: new FormControl(sets, {
        nonNullable: true,
        validators: [Validators.min(1)],
      }),
      reps: new FormControl(reps, {
        nonNullable: true,
        validators: [Validators.min(1)],
      }),
      weight: new FormControl(weight, { nonNullable: true }),
    });
    this.exerciseFormArray.push(group);
  }

  protected removeExercise(index: number): void {
    this.exerciseFormArray.removeAt(index);
  }

  protected openQuickAssign(preselectedMemberId?: string): void {
    const defaultMember =
      preselectedMemberId ||
      (this.overview()?.assignedMembers?.[0]?._id ?? '');

    this.assignForm.reset({
      assignedMember: defaultMember,
      workoutName: '',
      category: 'Strength',
      duration: 45,
      schedule: 'Mon, Wed, Fri - 8:00 AM',
      description: '',
    });

    this.exerciseFormArray.clear();
    this.addExercise('Barbell Squat', 3, 10, '60 kg');
    this.addExercise('Bench Press', 3, 10, '50 kg');
    this.addExercise('Deadlift', 3, 8, '80 kg');

    this.modalError.set(null);
    this.showAssignModal.set(true);
  }

  protected closeQuickAssign(): void {
    this.showAssignModal.set(false);
    this.modalError.set(null);
  }

  protected submitQuickAssign(): void {
    this.modalError.set(null);
    this.success.set(null);

    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const val = this.assignForm.getRawValue();
    const trainerId = this.currentUser()?._id;

    if (!trainerId) {
      this.modalError.set('Unable to determine trainer identity. Please re-login.');
      return;
    }

    const payload: CreateWorkoutPayload = {
      workoutName: val.workoutName.trim(),
      description: val.description.trim(),
      category: val.category,
      duration: Number(val.duration),
      schedule: val.schedule.trim(),
      assignedMember: val.assignedMember,
      assignedTrainer: trainerId,
      exercises: val.exercises.map((e) => ({
        name: e.name.trim(),
        sets: Number(e.sets),
        reps: Number(e.reps),
        weight: e.weight.trim(),
      })),
    };

    this.submittingWorkout.set(true);

    this.workoutService.createWorkout(payload).subscribe({
      next: (created) => {
        this.submittingWorkout.set(false);
        this.closeQuickAssign();
        this.success.set(
          `Workout "${created.workoutName}" successfully assigned!`,
        );
        this.loadOverview();
        setTimeout(() => this.success.set(null), 5000);
      },
      error: (err: HttpErrorResponse) => {
        this.submittingWorkout.set(false);
        this.modalError.set(
          err?.error?.message ?? 'Failed to assign workout routine.',
        );
      },
    });
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const c = this.assignForm.get(fieldName);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  protected getInitials(name: string): string {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
