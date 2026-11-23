import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WorkoutManagement } from './workout-management';
import { WorkoutService } from '../../../core/services/workout.service';
import { UserService, TrainerOverview } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/auth.models';

// --- Mock Data ---

const mockTrainer: User = {
  _id: 'trainer1',
  fullName: 'John Coach',
  email: 'coach@test.com',
  phone: '1234567890',
  gender: 'male',
  dateOfBirth: '1990-01-01',
  role: 'trainer',
};

const mockTrainer2: User = {
  _id: 'trainer2',
  fullName: 'Sarah Trainer',
  email: 'sarah@test.com',
  phone: '0987654321',
  gender: 'female',
  dateOfBirth: '1992-02-02',
  role: 'trainer',
};

const mockMemberWithTrainer: User = {
  _id: 'member1',
  fullName: 'Alice Member',
  email: 'alice@test.com',
  phone: '1112223333',
  gender: 'female',
  dateOfBirth: '1995-05-05',
  role: 'member',
  assignedTrainer: {
    _id: 'trainer1',
    fullName: 'John Coach',
    email: 'coach@test.com',
  } as any,
};

const mockMemberWithoutTrainer: User = {
  _id: 'member2',
  fullName: 'Bob Unassigned',
  email: 'bob@test.com',
  phone: '4445556666',
  gender: 'male',
  dateOfBirth: '1998-08-08',
  role: 'member',
  assignedTrainer: null,
};

const mockUsers: User[] = [mockTrainer, mockTrainer2, mockMemberWithTrainer, mockMemberWithoutTrainer];

const mockTrainerOverview: TrainerOverview = {
  totalAssignedMembers: 1,
  totalWorkouts: 2,
  activeWorkoutRoutines: 1,
  completedWorkoutSessions: 5,
  overallCompletionRate: 80,
  assignedMembers: [
    {
      _id: 'member1',
      fullName: 'Alice Member',
      email: 'alice@test.com',
      phone: '1112223333',
      gender: 'female',
      assignedDate: '2026-01-01',
      assignedWorkoutsCount: 2,
      completedWorkoutsCount: 1,
      activeWorkoutsCount: 1,
      completionRate: 50,
    },
  ],
  workouts: [],
  recentActivities: [],
};

const mockWorkouts = [
  {
    _id: 'w1',
    workoutName: 'Strength Circuit',
    description: 'Full body routine',
    category: 'Strength',
    duration: 45,
    schedule: 'Mon, Wed, Fri',
    status: 'assigned',
    assignedMember: { _id: 'member1', fullName: 'Alice Member' },
    assignedTrainer: { _id: 'trainer1', fullName: 'John Coach' },
    exercises: [],
    createdAt: new Date().toISOString(),
  },
];

describe('WorkoutManagement – Assign to Member dropdown and Trainer link', () => {
  let fixture: ComponentFixture<WorkoutManagement>;
  let component: WorkoutManagement;

  const mockWorkoutService = {
    getWorkouts: vi.fn(),
    createWorkout: vi.fn(),
    updateWorkout: vi.fn(),
    updateWorkoutStatus: vi.fn(),
    deleteWorkout: vi.fn(),
  };

  const mockUserService = {
    getUsers: vi.fn(),
    getTrainerOverview: vi.fn(),
  };

  function setupAuth(role: 'admin' | 'trainer' | 'member', currentUserObj = mockTrainer) {
    return {
      userRole: signal(role),
      currentUser: signal(currentUserObj),
    };
  }

  async function createComponent(
    role: 'admin' | 'trainer' | 'member' = 'admin',
    queryParams: Record<string, string | null> = {},
  ) {
    vi.clearAllMocks();
    mockWorkoutService.getWorkouts.mockReturnValue(of(mockWorkouts));
    mockWorkoutService.createWorkout.mockReturnValue(of(mockWorkouts[0]));
    mockWorkoutService.updateWorkout.mockReturnValue(of(mockWorkouts[0]));
    mockWorkoutService.updateWorkoutStatus.mockReturnValue(of(mockWorkouts[0]));
    mockWorkoutService.deleteWorkout.mockReturnValue(of({}));
    mockUserService.getUsers.mockReturnValue(of(mockUsers));
    mockUserService.getTrainerOverview.mockReturnValue(of(mockTrainerOverview));

    const queryMap = new Map(Object.entries(queryParams));
    const activatedRouteMock = {
      queryParamMap: of({ get: (key: string) => queryMap.get(key) ?? null }),
    };

    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorkoutManagement, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: WorkoutService, useValue: mockWorkoutService },
        { provide: UserService, useValue: mockUserService },
        { provide: AuthService, useValue: setupAuth(role, role === 'trainer' ? mockTrainer : ({ _id: 'admin1', fullName: 'Admin User', role: 'admin' } as any)) },
        { provide: ActivatedRoute, useValue: activatedRouteMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkoutManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ── 1. Admin Role User Loading ──────────────────────────────
  it('should load members and trainers via getUsers() when logged in as admin', async () => {
    await createComponent('admin');
    expect(mockUserService.getUsers).toHaveBeenCalled();
    expect(mockUserService.getTrainerOverview).not.toHaveBeenCalled();

    // Check members and trainers populated
    expect((component as any).members().length).toBe(2);
    expect((component as any).trainers().length).toBe(2);
  });

  // ── 2. Trainer Role User Loading (Bugfix for 403 Forbidden) ─
  it('should load assigned members via getTrainerOverview() when logged in as trainer (prevents 403)', async () => {
    await createComponent('trainer');
    expect(mockUserService.getTrainerOverview).toHaveBeenCalled();
    expect(mockUserService.getUsers).not.toHaveBeenCalled();

    // Check trainer assigned members populated
    expect((component as any).members().length).toBe(1);
    expect((component as any).members()[0]._id).toBe('member1');
    expect((component as any).members()[0].fullName).toBe('Alice Member');
    expect((component as any).trainers().length).toBe(1);
    expect((component as any).trainers()[0]._id).toBe('trainer1');
  });

  // ── 3. Dropdown has options in modal ────────────────────────
  it('should render member options in the DOM when modal is opened by admin', async () => {
    await createComponent('admin');
    (component as any).openAdd();
    fixture.detectChanges();

    const selectEl: HTMLSelectElement = fixture.nativeElement.querySelector('select[formControlName="assignedMember"]');
    expect(selectEl).toBeTruthy();

    // 1 placeholder + 2 members = 3 options
    expect(selectEl.options.length).toBe(3);
    expect(selectEl.options[1].text).toContain('Alice Member');
    expect(selectEl.options[2].text).toContain('Bob Unassigned');
  });

  it('should render assigned member options in the DOM when modal is opened by trainer', async () => {
    await createComponent('trainer');
    (component as any).openAdd();
    fixture.detectChanges();

    const selectEl: HTMLSelectElement = fixture.nativeElement.querySelector('select[formControlName="assignedMember"]');
    expect(selectEl).toBeTruthy();

    // 1 placeholder + 1 assigned member = 2 options
    expect(selectEl.options.length).toBe(2);
    expect(selectEl.options[1].text).toContain('Alice Member');
  });

  // ── 4. Selecting a member correctly displays Assigned Trainer ─
  it('should auto-populate and display assigned trainer when admin selects a member with assigned trainer', async () => {
    await createComponent('admin');
    (component as any).openAdd();
    fixture.detectChanges();

    // Select member1 (Alice Member, assigned to trainer1)
    (component as any).workoutForm.controls.assignedMember.setValue('member1');
    fixture.detectChanges();

    expect((component as any).workoutForm.controls.assignedTrainer.value).toBe('trainer1');
    expect((component as any).selectedMemberTrainerName()).toBe('John Coach');

    // Verify hint text rendered in DOM
    const hint: HTMLElement = fixture.nativeElement.querySelector('.assigned-trainer-hint');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('John Coach');
  });

  it('should clear trainer selection and display no hint when selecting member without trainer', async () => {
    await createComponent('admin');
    (component as any).openAdd();
    fixture.detectChanges();

    // Select member2 (Bob Unassigned, has no trainer)
    (component as any).workoutForm.controls.assignedMember.setValue('member2');
    fixture.detectChanges();

    expect((component as any).selectedMemberTrainerName()).toBeNull();
    const hint = fixture.nativeElement.querySelector('.assigned-trainer-hint');
    expect(hint).toBeFalsy();
  });

  it('should automatically set trainer to current trainer when role is trainer', async () => {
    await createComponent('trainer');
    (component as any).openAdd();
    fixture.detectChanges();

    (component as any).workoutForm.controls.assignedMember.setValue('member1');
    fixture.detectChanges();

    expect((component as any).workoutForm.controls.assignedTrainer.value).toBe('trainer1');
    expect((component as any).selectedMemberTrainerName()).toBe('John Coach');
  });

  // ── 5. Deferred modal open when action=assign in query params ─
  it('should defer opening modal until members are loaded when query param has action=assign', async () => {
    vi.clearAllMocks();
    const usersSubject = new Subject<User[]>();
    mockUserService.getUsers.mockReturnValue(usersSubject.asObservable());
    mockWorkoutService.getWorkouts.mockReturnValue(of([]));

    const queryMap = new Map([['memberId', 'member1'], ['action', 'assign']]);
    const activatedRouteMock = {
      queryParamMap: of({ get: (key: string) => queryMap.get(key) ?? null }),
    };

    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WorkoutManagement, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: WorkoutService, useValue: mockWorkoutService },
        { provide: UserService, useValue: mockUserService },
        { provide: AuthService, useValue: setupAuth('admin') },
        { provide: ActivatedRoute, useValue: activatedRouteMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkoutManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Modal not open yet because users have not loaded
    expect((component as any).modalMode()).toBeNull();

    // Users load
    usersSubject.next(mockUsers);
    usersSubject.complete();
    fixture.detectChanges();

    // Now modal should be open with member and trainer auto-selected
    expect((component as any).modalMode()).toBe('add');
    expect((component as any).workoutForm.controls.assignedMember.value).toBe('member1');
    expect((component as any).workoutForm.controls.assignedTrainer.value).toBe('trainer1');
    expect((component as any).selectedMemberTrainerName()).toBe('John Coach');
  });

  // ── 6. Form Submission ─────────────────────────────────────
  it('should submit workout when all required fields including assignedMember and assignedTrainer are filled', async () => {
    await createComponent('admin');
    (component as any).openAdd();
    fixture.detectChanges();

    (component as any).workoutForm.patchValue({
      workoutName: 'Upper Body Power',
      description: 'Chest and Back focus',
      assignedMember: 'member1',
      assignedTrainer: 'trainer1',
    });

    (component as any).submitWorkout();

    expect(mockWorkoutService.createWorkout).toHaveBeenCalled();
    const payload = mockWorkoutService.createWorkout.mock.calls[0][0];
    expect(payload.workoutName).toBe('Upper Body Power');
    expect(payload.assignedMember).toBe('member1');
    expect(payload.assignedTrainer).toBe('trainer1');
  });

  it('should NOT submit when assignedMember is empty', async () => {
    await createComponent('admin');
    (component as any).openAdd();
    fixture.detectChanges();

    (component as any).workoutForm.patchValue({
      workoutName: 'Upper Body Power',
      description: 'Chest and Back focus',
      assignedMember: '',
      assignedTrainer: 'trainer1',
    });

    (component as any).submitWorkout();
    expect(mockWorkoutService.createWorkout).not.toHaveBeenCalled();
  });

  // ── 7. Modal Close & Cleanup ────────────────────────────────
  it('should reset selectedMemberTrainerName and modalMode on closeModal', async () => {
    await createComponent('admin');
    (component as any).openAdd();
    (component as any).workoutForm.controls.assignedMember.setValue('member1');
    fixture.detectChanges();

    expect((component as any).selectedMemberTrainerName()).toBe('John Coach');

    (component as any).closeModal();
    expect((component as any).modalMode()).toBeNull();
    expect((component as any).selectedMemberTrainerName()).toBeNull();
  });
});
