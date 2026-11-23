import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ReportsManagement } from './reports-management';
import { ReportData, ReportService } from '../../../../core/services/report.service';

describe('ReportsManagement Component', () => {
  let component: ReportsManagement;
  let fixture: ComponentFixture<ReportsManagement>;

  const mockReportData: ReportData = {
    type: 'all',
    summary: {
      totalMembers: 25,
      totalTrainers: 4,
      activeMemberships: 18,
      expiredMemberships: 7,
      totalRevenue: 5400,
      pendingRevenue: 450,
      totalCheckIns: 120,
      totalWorkouts: 45,
    },
    membershipReport: {
      totalPlans: 3,
      activePlans: 3,
      inactivePlans: 0,
      activeSubscriptions: 18,
      expiredSubscriptions: 7,
      plans: [
        {
          _id: 'p1',
          planName: 'Gold Plan',
          price: 150,
          duration: 30,
          status: 'active',
          subscribersCount: 15,
          totalRevenue: 2250,
        },
      ],
    },
    paymentReport: {
      totalRevenue: 5400,
      pendingAmount: 450,
      failedAmount: 0,
      totalCount: 30,
      paidCount: 28,
      pendingCount: 2,
      failedCount: 0,
      payments: [
        {
          _id: 'pay1',
          amount: 150,
          paymentStatus: 'paid',
          transactionReference: 'TXN-001',
          paymentDate: '2026-05-10T10:00:00.000Z',
          member: {
            _id: 'm1',
            fullName: 'Alice Member',
            email: 'alice@test.com',
          },
        },
      ],
    },
    attendanceReport: {
      totalRecords: 120,
      presentCount: 110,
      lateCount: 10,
      absentCount: 0,
      uniqueMembersAttended: 22,
      records: [
        {
          _id: 'att1',
          attendanceDate: '2026-05-10T00:00:00.000Z',
          checkInTime: '2026-05-10T09:00:00.000Z',
          status: 'present',
          member: {
            _id: 'm1',
            fullName: 'Alice Member',
            email: 'alice@test.com',
          },
        },
      ],
    },
    registrationReport: {
      totalRegistrations: 29,
      membersCount: 25,
      trainersCount: 4,
      registrations: [
        {
          _id: 'm1',
          fullName: 'Alice Member',
          email: 'alice@test.com',
          role: 'member',
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    },
  };

  const mockReportService = {
    getReports: vi.fn().mockReturnValue(of(mockReportData)),
  };

  beforeEach(async () => {
    mockReportService.getReports.mockClear();
    mockReportService.getReports.mockReturnValue(of(mockReportData));

    await TestBed.configureTestingModule({
      imports: [ReportsManagement],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ReportService, useValue: mockReportService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component and load reports', () => {
    expect(component).toBeTruthy();
    expect(mockReportService.getReports).toHaveBeenCalled();
    expect(component['report']()).toEqual(mockReportData);
    expect(component['loading']()).toBe(false);
  });

  it('should display executive summary metrics correctly', () => {
    const el: HTMLElement = fixture.nativeElement;
    const statCards = el.querySelectorAll('.stat-card');
    expect(statCards.length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Total Members');
    expect(el.textContent).toContain('25');
  });

  it('should switch tabs and reload reports with type filter', () => {
    component['setTab']('membership');
    expect(component['activeTab']()).toBe('membership');
    expect(mockReportService.getReports).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'membership' }),
    );
  });

  it('should change date presets and trigger reload', () => {
    component['onPresetChange']('7days');
    expect(component['selectedPreset']()).toBe('7days');
    expect(component['startDate']()).not.toBe('');
    expect(mockReportService.getReports).toHaveBeenCalled();
  });

  it('should filter by status and trigger reload', () => {
    component['onStatusChange']('paid');
    expect(component['statusFilter']()).toBe('paid');
    expect(mockReportService.getReports).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'paid' }),
    );
  });

  it('should handle API errors cleanly', () => {
    mockReportService.getReports.mockReturnValue(
      throwError(() => ({ error: { message: 'Failed to load report' } })),
    );
    component['loadReports']();
    fixture.detectChanges();

    expect(component['error']()).toBe('Failed to load report');
    expect(component['loading']()).toBe(false);
  });
});

