import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TrainerManagement } from './trainer-management';
import { UserService, TrainerAssignmentsOverview } from '../../../core/services/user.service';
import { TrainerService } from '../../../core/services/trainer.service';
import { User } from '../../../core/models/auth.models';

describe('TrainerManagement Component', () => {
  let component: TrainerManagement;
  let fixture: ComponentFixture<TrainerManagement>;

  const mockTrainers: User[] = [
    {
      _id: 't1',
      fullName: 'Trainer Alice',
      email: 'alice@trainer.com',
      phone: '1112223333',
      gender: 'female',
      dateOfBirth: '1990-01-01',
      role: 'trainer',
      specialization: 'Cardio & HIIT',
      experienceYears: 4,
      bio: 'High energy fitness coach.',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      _id: 't2',
      fullName: 'Trainer Bob',
      email: 'bob@trainer.com',
      phone: '4445556666',
      gender: 'male',
      dateOfBirth: '1985-05-05',
      role: 'trainer',
      specialization: 'Weightlifting',
      experienceYears: 8,
      bio: 'Strength specialist.',
      createdAt: '2026-02-01T00:00:00.000Z',
    },
  ];

  const mockMembers: User[] = [
    {
      _id: 'm1',
      fullName: 'Member One',
      email: 'one@member.com',
      phone: '9991112222',
      gender: 'male',
      dateOfBirth: '2000-01-01',
      role: 'member',
    },
  ];

  const mockAssignmentsOverview: TrainerAssignmentsOverview = {
    totalTrainers: 2,
    totalAssignedMembers: 1,
    totalUnassignedMembers: 0,
    trainers: [
      {
        _id: 't1',
        fullName: 'Trainer Alice',
        email: 'alice@trainer.com',
        assignedMembersCount: 1,
        assignedMembers: [
          {
            _id: 'm1',
            fullName: 'Member One',
            email: 'one@member.com',
          },
        ],
      },
    ],
    unassignedMembers: [],
  };

  const mockUserService = {
    getUsers: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    getTrainerAssignmentsOverview: vi.fn(),
  };

  const mockTrainerService = {
    getPublicTrainers: vi.fn(),
    assignMemberToTrainer: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockUserService.getUsers.mockImplementation((filters?: any) => {
      if (filters?.role === 'member') {
        return of(mockMembers);
      }
      return of(mockTrainers);
    });

    mockUserService.getTrainerAssignmentsOverview.mockReturnValue(of(mockAssignmentsOverview));

    await TestBed.configureTestingModule({
      imports: [TrainerManagement],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: UserService, useValue: mockUserService },
        { provide: TrainerService, useValue: mockTrainerService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrainerManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component and load trainers and assignment data', () => {
    expect(component).toBeTruthy();
    expect(component.trainers().length).toBe(2);
    expect(component.members().length).toBe(1);
    expect(component.assignmentOverview().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('should filter trainers by search value and reset filters', () => {
    component.onSearchChange({ target: { value: 'Alice' } } as any);
    expect(mockUserService.getUsers).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'trainer', search: 'Alice' }),
    );

    component.resetFilters();
    expect(component.searchValue()).toBe('');
    expect(mockUserService.getUsers).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'trainer', search: '' }),
    );
  });

  it('should open Add Trainer modal and validate form fields', () => {
    component.openAdd();
    expect(component.modalMode()).toBe('add');
    expect(component.addForm.valid).toBe(false);

    component.addForm.patchValue({
      fullName: 'New Trainer',
      email: 'newtrainer@test.com',
      phone: '1234567890',
      gender: 'female',
      specialization: 'Pilates',
      experienceYears: 3,
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });
    expect(component.addForm.valid).toBe(true);
  });

  it('should submit Add Trainer and handle duplicate email error', () => {
    component.openAdd();
    component.addForm.patchValue({
      fullName: 'Duplicate Trainer',
      email: 'alice@trainer.com',
      phone: '1234567890',
      gender: 'female',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    });

    mockUserService.createUser.mockReturnValue(
      throwError(() => ({ error: { message: 'Email is already registered.' } })),
    );

    component.submitAdd();
    expect(component.submitting()).toBe(false);
    expect(component.error()).toBe('Email is already registered.');
  });

  it('should open View modal and display trainer details and assigned members', () => {
    const trainer = mockTrainers[0];
    component.openView(trainer);
    expect(component.modalMode()).toBe('view');
    expect(component.selectedTrainer()).toEqual(trainer);

    const count = component.getAssignedCount(trainer._id);
    expect(count).toBe(1);

    const assignedMembers = component.getAssignedMembers(trainer._id);
    expect(assignedMembers.length).toBe(1);
    expect(assignedMembers[0].fullName).toBe('Member One');
  });

  it('should open Edit modal and update trainer fields', () => {
    const trainer = mockTrainers[0];
    component.openEdit(trainer);
    expect(component.modalMode()).toBe('edit');
    expect(component.editForm.get('specialization')?.value).toBe('Cardio & HIIT');

    mockUserService.updateUser.mockReturnValue(of({ ...trainer, specialization: 'Advanced HIIT' }));

    component.editForm.patchValue({ specialization: 'Advanced HIIT' });
    component.submitEdit();

    expect(mockUserService.updateUser).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        specialization: 'Advanced HIIT',
      }),
    );
    expect(component.modalMode()).toBeNull();
  });

  it('should open Assign Member modal and assign member to trainer', () => {
    component.openAssign();
    expect(component.showAssignModal).toBe(true);

    component.assignForm.patchValue({
      memberId: 'm1',
      trainerId: 't2',
    });

    mockTrainerService.assignMemberToTrainer.mockReturnValue(of({} as any));
    component.assign();

    expect(mockTrainerService.assignMemberToTrainer).toHaveBeenCalledWith('m1', 't2');
  });

  it('should open Delete modal and delete trainer successfully', () => {
    const trainer = mockTrainers[1];
    component.openDelete(trainer);
    expect(component.modalMode()).toBe('delete');

    mockUserService.deleteUser.mockReturnValue(of(undefined as any));
    component.confirmDelete();

    expect(mockUserService.deleteUser).toHaveBeenCalledWith('t2');
    expect(component.modalMode()).toBeNull();
  });
});
