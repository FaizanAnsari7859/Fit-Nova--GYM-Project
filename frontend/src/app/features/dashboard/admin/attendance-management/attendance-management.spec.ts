import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttendanceManagement } from './attendance-management';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { AttendanceService, AttendanceRecord } from '../../../../core/services/attendance.service';
import { UserService } from '../../../../core/services/user.service';
import { signal } from '@angular/core';

describe('AttendanceManagement Component', () => {
  let component: AttendanceManagement;
  let fixture: ComponentFixture<AttendanceManagement>;

  const mockUserRole = signal<'admin' | 'trainer' | 'member'>('admin');
  const mockCurrentUser = signal({ _id: 'u_admin', fullName: 'Admin User', role: 'admin' });

  const mockAuthService = {
    userRole: mockUserRole,
    currentUser: mockCurrentUser,
  };

  const mockRecords: AttendanceRecord[] = [
    {
      _id: 'att1',
      member: { _id: 'm1', fullName: 'Alice Johnson', email: 'alice@test.com' },
      checkInTime: '2026-05-10T10:00:00.000Z',
      checkOutTime: null,
      attendanceDate: '2026-05-10T00:00:00.000Z',
      status: 'present',
    },
    {
      _id: 'att2',
      member: { _id: 'm2', fullName: 'Bob Smith', email: 'bob@test.com' },
      checkInTime: '2026-05-10T10:15:00.000Z',
      checkOutTime: '2026-05-10T11:15:00.000Z',
      attendanceDate: '2026-05-10T00:00:00.000Z',
      status: 'late',
    },
  ];

  const mockAttendanceService = {
    listAttendance: vi.fn().mockReturnValue(
      of({
        success: true,
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        count: 2,
        data: mockRecords,
      })
    ),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    deleteAttendance: vi.fn(),
  };

  const mockUserService = {
    getUsers: vi.fn().mockReturnValue(of([])),
  };

  beforeEach(async () => {
    mockUserRole.set('admin');

    await TestBed.configureTestingModule({
      imports: [AttendanceManagement],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
        { provide: AttendanceService, useValue: mockAttendanceService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AttendanceManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load attendance records on init', () => {
    expect(mockAttendanceService.listAttendance).toHaveBeenCalled();
  });

  describe('Role-based permissions', () => {
    it('admin should be able to record and delete attendance', () => {
      mockUserRole.set('admin');
      expect((component as any).canRecord()).toBe(true);
      expect((component as any).canDelete()).toBe(true);
    });

    it('trainer should be able to record attendance, but not delete', () => {
      mockUserRole.set('trainer');
      expect((component as any).canRecord()).toBe(true);
      expect((component as any).canDelete()).toBe(false);
    });

    it('member should have read-only permissions', () => {
      mockUserRole.set('member');
      expect((component as any).canRecord()).toBe(false);
      expect((component as any).canDelete()).toBe(false);
    });
  });

  describe('Formatting helpers', () => {
    it('should format member names safely', () => {
      expect((component as any).getMemberName(mockRecords[0].member)).toBe('Alice Johnson');
      expect((component as any).getMemberName('raw_id')).toBe('Member');
    });

    it('should format status badge classes correctly', () => {
      expect((component as any).getStatusBadgeClass('present')).toBe('badge badge-success');
      expect((component as any).getStatusBadgeClass('late')).toBe('badge badge-warning');
      expect((component as any).getStatusBadgeClass('absent')).toBe('badge badge-danger');
    });
  });

  describe('Modal interactions', () => {
    it('openCheckInModal should set modalMode to checkin', () => {
      (component as any).openCheckInModal();
      expect((component as any).modalMode()).toBe('checkin');
    });

    it('openCheckOutModal should set modalMode to checkout and set selectedRecord', () => {
      (component as any).openCheckOutModal(mockRecords[0]);
      expect((component as any).modalMode()).toBe('checkout');
      expect((component as any).selectedRecord()).toEqual(mockRecords[0]);
    });

    it('closeModal should clear modalMode and selection', () => {
      (component as any).openCheckInModal();
      (component as any).closeModal();
      expect((component as any).modalMode()).toBeNull();
      expect((component as any).selectedRecord()).toBeNull();
    });
  });
});

