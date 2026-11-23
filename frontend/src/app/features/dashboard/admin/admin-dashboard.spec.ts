import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminDashboard } from './admin-dashboard';
import {
  AdminStats,
  TrainerAssignmentsOverview,
  UserService,
} from '../../../core/services/user.service';

describe('AdminDashboard Component - Trainer-wise Member Assignments', () => {
  let component: AdminDashboard;
  let fixture: ComponentFixture<AdminDashboard>;

  const mockAdminStats: AdminStats = {
    totalMembers: 20,
    totalTrainers: 3,
    activeMemberships: 15,
    expiredMemberships: 5,
    totalPayments: 25,
    totalRevenue: 3500,
    pendingPayments: 2,
    todayAttendance: 8,
    recentMembers: [
      {
        _id: 'm1',
        fullName: 'Alice Member',
        email: 'alice@test.com',
        role: 'member',
        createdAt: '2026-05-01T00:00:00.000Z',
      } as any,
    ],
    recentPayments: [],
    recentAttendance: [],
  };

  const mockAssignmentsOverview: TrainerAssignmentsOverview = {
    totalTrainers: 2,
    totalAssignedMembers: 2,
    totalUnassignedMembers: 1,
    trainers: [
      {
        _id: 't1',
        fullName: 'Trainer John',
        email: 'john@trainer.com',
        specialization: 'Strength Training',
        assignedMembersCount: 2,
        assignedMembers: [
          {
            _id: 'm1',
            fullName: 'Alice Member',
            email: 'alice@test.com',
            phone: '1234567890',
            membershipStatus: 'active',
          },
          {
            _id: 'm2',
            fullName: 'Bob Smith',
            email: 'bob@test.com',
            phone: '0987654321',
            membershipStatus: 'expired',
          },
        ],
      },
      {
        _id: 't2',
        fullName: 'Trainer Sarah',
        email: 'sarah@trainer.com',
        specialization: 'Yoga',
        assignedMembersCount: 0,
        assignedMembers: [],
      },
    ],
    unassignedMembers: [
      {
        _id: 'm3',
        fullName: 'Charlie Unassigned',
        email: 'charlie@test.com',
        phone: '5555555555',
        membershipStatus: 'none',
      },
    ],
  };

  const mockUserService = {
    getAdminStats: vi.fn().mockReturnValue(of(mockAdminStats)),
    getTrainerAssignmentsOverview: vi
      .fn()
      .mockReturnValue(of(mockAssignmentsOverview)),
  };

  beforeEach(async () => {
    mockUserService.getAdminStats.mockClear();
    mockUserService.getTrainerAssignmentsOverview.mockClear();
    mockUserService.getAdminStats.mockReturnValue(of(mockAdminStats));
    mockUserService.getTrainerAssignmentsOverview.mockReturnValue(
      of(mockAssignmentsOverview),
    );

    await TestBed.configureTestingModule({
      imports: [AdminDashboard],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: UserService, useValue: mockUserService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component and load stats and assignments', () => {
    expect(component).toBeTruthy();
    expect(mockUserService.getAdminStats).toHaveBeenCalled();
    expect(mockUserService.getTrainerAssignmentsOverview).toHaveBeenCalled();
    expect(component['assignments']()).toEqual(mockAssignmentsOverview);
    expect(component['loadingAssignments']()).toBe(false);
  });

  it('should display trainer assignment summary cards', () => {
    const el: HTMLElement = fixture.nativeElement;
    const cardsText = el.textContent;
    expect(cardsText).toContain('Trainer-wise Member Assignments');
    expect(cardsText).toContain('Total Trainers');
    expect(cardsText).toContain('Assigned Members');
    expect(cardsText).toContain('Unassigned Members');
  });

  it('should display trainers table with correct counts and names preview', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Trainer John');
    expect(el.textContent).toContain('john@trainer.com');
    expect(el.textContent).toContain('2 members');
    expect(el.textContent).toContain('Alice Member, Bob Smith');

    expect(el.textContent).toContain('Trainer Sarah');
    expect(el.textContent).toContain('0 members');
    expect(el.textContent).toContain('None');
  });

  it('should expand and collapse a trainer to view assigned member details', () => {
    expect(component.isTrainerExpanded('t1')).toBe(false);

    // Expand Trainer John
    component.toggleTrainer('t1');
    fixture.detectChanges();
    expect(component.isTrainerExpanded('t1')).toBe(true);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Members assigned to Trainer John:');
    expect(el.textContent).toContain('1234567890');

    // Collapse Trainer John
    component.toggleTrainer('t1');
    fixture.detectChanges();
    expect(component.isTrainerExpanded('t1')).toBe(false);
  });

  it('should show clear message when a trainer has zero assigned members upon expansion', () => {
    component.toggleTrainer('t2');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No members are currently assigned to this trainer.');
  });

  it('should toggle unassigned members section and display unassigned members', () => {
    expect(component['unassignedExpanded']()).toBe(false);

    component.toggleUnassigned();
    fixture.detectChanges();
    expect(component['unassignedExpanded']()).toBe(true);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Charlie Unassigned');
    expect(el.textContent).toContain('charlie@test.com');
  });

  it('should handle assignment loading error gracefully', () => {
    mockUserService.getTrainerAssignmentsOverview.mockReturnValue(
      throwError(() => ({ error: { message: 'Database connection failed' } })),
    );

    component['loadAssignments']();
    fixture.detectChanges();

    expect(component['assignmentsError']()).toBe('Database connection failed');
    expect(component['loadingAssignments']()).toBe(false);
  });
});

