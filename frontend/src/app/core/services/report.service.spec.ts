import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ReportService } from './report.service';
import { environment } from '../../../environments/environment';

describe('ReportService', () => {
  let service: ReportService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReportService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ReportService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch reports without query params when none provided', () => {
    service.getReports().subscribe((data) => {
      expect(data.summary.totalMembers).toBe(10);
    });

    const req = httpTesting.expectOne(`${environment.apiUrl}/reports`);
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: {
        type: 'all',
        summary: {
          totalMembers: 10,
          totalTrainers: 2,
          activeMemberships: 8,
          expiredMemberships: 2,
          totalRevenue: 1200,
          pendingRevenue: 0,
          totalCheckIns: 40,
          totalWorkouts: 15,
        },
      },
    });
  });

  it('should include filters in query params when provided', () => {
    service
      .getReports({
        type: 'payments',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        status: 'paid',
      })
      .subscribe((data) => {
        expect(data.type).toBe('payments');
      });

    const req = httpTesting.expectOne(
      (r) =>
        r.url === `${environment.apiUrl}/reports` &&
        r.params.get('type') === 'payments' &&
        r.params.get('startDate') === '2026-05-01' &&
        r.params.get('endDate') === '2026-05-31' &&
        r.params.get('status') === 'paid',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: {
        type: 'payments',
        summary: {} as any,
      },
    });
  });
});

