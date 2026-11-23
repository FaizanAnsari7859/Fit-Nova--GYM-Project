import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { TrainerDashboard } from './trainer-dashboard';
import { UserService, TrainerOverview } from '../../../core/services/user.service';
import { WorkoutService, Workout } from '../../../core/services/workout.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/auth.models';

describe('TrainerDashboard Component - Assign Workout Modal', () => {
  let component: TrainerDashboard;
  let fixture: ComponentFixture<TrainerDashboard>;

  const mockTrainerUser: User = {
    _id: 'trainer1',
    fullName: 'Trainer John',
    email: 'john@trainer.com',
    phone: '1234567890',
    gender: 'male',
    dateOfBirth: '1988-01-01',
    role: 'trainer',
  };

  const mockOverview: TrainerOverview = {
    totalAssignedMembers: 2,
    totalWorkouts: 4,
    activeWorkoutRoutines: 3,
    completedWorkoutSessions: 12,
    overallCompletionRate: 75,
    assignedMembers: [
      {
        _id: 'm1',
        fullName: 'Client Alice',
        email: 'alice@client.com',
        phone: '1112223333',
        assignedDate: '2026-01-01',
        assignedWorkoutsCount: 2,
        completedWorkoutsCount: 1,
        activeWorkoutsCount: 1,
        completionRate: 50,
      },
      {
        _id: 'm2',
        fullName: 'Client Bob',
        email: 'bob@client.com',
        phone: '4445556666',
        assignedDate: '2026-02-01',
        assignedWorkoutsCount: 1,
        completedWorkoutsCount: 1,
        activeWorkoutsCount: 0,
        completionRate: 100,
      },
    ],
    workouts: [],
    recentActivities: [],
  };

  const mockCreatedWorkout: Workout = {
    _id: 'w100',
    workoutName: 'Hypertrophy Upper Body',
    description: 'Upper body focus routine',
    category: 'Strength',
    duration: 45,
    schedule: 'Mon, Wed, Fri - 8:00 AM',
    assignedMember: 'm1' as any,
    assignedTrainer: 'trainer1' as any,
    exercises: [
      { name: 'Barbell Squat', sets: 3, reps: 10, weight: '60 kg' },
    ],
    status: 'assigned',
    createdAt: '2026-03-01T00:00:00.000Z',
  };

  const mockUserService = {
    getTrainerOverview: vi.fn(),
  };

  const mockWorkoutService = {
    createWorkout: vi.fn(),
  };

  const mockAuthService = {
    currentUser: signal<User | null>(mockTrainerUser),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUserService.getTrainerOverview.mockReturnValue(of(mockOverview));
    mockWorkoutService.createWorkout.mockReturnValue(of(mockCreatedWorkout));

    await TestBed.configureTestingModule({
      imports: [TrainerDashboard],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: UserService, useValue: mockUserService },
        { provide: WorkoutService, useValue: mockWorkoutService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrainerDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component and load trainer overview data', () => {
    expect(component).toBeTruthy();
    expect(component.overview()).toEqual(mockOverview);
    expect(component.loading()).toBe(false);
  });

  it('should open the quick assign modal with default fields and exercises populated', () => {
    component.openQuickAssign('m2');
    expect(component.showAssignModal()).toBe(true);
    expect(component.assignForm.get('assignedMember')?.value).toBe('m2');
    expect(component.assignForm.get('category')?.value).toBe('Strength');
    expect(component.assignForm.get('duration')?.value).toBe(45);
    expect(component.exerciseFormArray.length).toBe(3);
    expect(component.modalError()).toBeNull();
  });

  it('should close the quick assign modal when cancelled', () => {
    component.openQuickAssign();
    expect(component.showAssignModal()).toBe(true);

    component.closeQuickAssign();
    expect(component.showAssignModal()).toBe(false);
    expect(component.modalError()).toBeNull();
  });

  it('should allow dynamically adding and removing exercise movements', () => {
    component.openQuickAssign();
    expect(component.exerciseFormArray.length).toBe(3);

    component.addExercise('Overhead Press', 4, 8, '40 kg');
    expect(component.exerciseFormArray.length).toBe(4);
    expect(component.exerciseFormArray.at(3).get('name')?.value).toBe('Overhead Press');

    component.removeExercise(0);
    expect(component.exerciseFormArray.length).toBe(3);
  });

  it('should validate required fields and not submit when form is invalid', () => {
    component.openQuickAssign();
    component.assignForm.patchValue({
      workoutName: '', // invalid
      description: '', // invalid
    });

    component.submitQuickAssign();

    expect(component.isFieldInvalid('workoutName')).toBe(true);
    expect(component.isFieldInvalid('description')).toBe(true);
    expect(mockWorkoutService.createWorkout).not.toHaveBeenCalled();
  });

  it('should submit valid workout assignment and call workoutService.createWorkout', () => {
    component.openQuickAssign('m1');
    component.assignForm.patchValue({
      workoutName: 'Hypertrophy Upper Body',
      description: 'Upper body focus routine',
      category: 'Strength',
      duration: 45,
      schedule: 'Mon, Wed, Fri - 8:00 AM',
    });

    component.submitQuickAssign();

    expect(mockWorkoutService.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        workoutName: 'Hypertrophy Upper Body',
        description: 'Upper body focus routine',
        category: 'Strength',
        duration: 45,
        assignedMember: 'm1',
        assignedTrainer: 'trainer1',
      }),
    );

    // Modal closes and success is displayed
    expect(component.showAssignModal()).toBe(false);
    expect(component.success()).toContain('Hypertrophy Upper Body');
    // Overview reloads
    expect(mockUserService.getTrainerOverview).toHaveBeenCalledTimes(2);
  });

  it('should handle API error during workout assignment and keep modal open', () => {
    mockWorkoutService.createWorkout.mockReturnValue(
      throwError(() => ({
        error: { message: 'Trainers can only assign workouts to members assigned to them.' },
      })),
    );

    component.openQuickAssign('m1');
    component.assignForm.patchValue({
      workoutName: 'Denied Workout',
      description: 'Unauthorized routine',
    });

    component.submitQuickAssign();

    expect(component.submittingWorkout()).toBe(false);
    expect(component.showAssignModal()).toBe(true);
    expect(component.modalError()).toBe('Trainers can only assign workouts to members assigned to them.');
  });
});

