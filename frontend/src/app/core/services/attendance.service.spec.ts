import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AttendanceService, AttendanceRecord } from './attendance.service';
import { environment } from '../../../environments/environment';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let httpMock: HttpTestingController;
  const apiUrl = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AttendanceService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AttendanceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list attendance with filters', () => {
    const mockResponse = {
      success: true,
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      count: 1,
      data: [
        {
          _id: 'att1',
          member: 'm1',
          checkInTime: '2026-05-10T10:00:00.000Z',
          checkOutTime: null,
          attendanceDate: '2026-05-10T10:00:00.000Z',
          status: 'present' as const,
        },
      ],
    };

    service.listAttendance({ status: 'present', page: 1, limit: 10 }).subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.data[0].status).toBe('present');
    });

    const req = httpMock.expectOne((r) => r.url === `${apiUrl}/attendance` && r.params.get('status') === 'present');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should record check-in', () => {
    const payload = {
      member: 'm1',
      checkInTime: '2026-05-10T10:00:00.000Z',
      attendanceDate: '2026-05-10T10:00:00.000Z',
      status: 'present' as const,
    };

    const mockRecord: AttendanceRecord = {
      _id: 'att_new',
      checkOutTime: null,
      ...payload,
    };

    service.checkIn(payload).subscribe((res) => {
      expect(res._id).toBe('att_new');
      expect(res.status).toBe('present');
    });

    const req = httpMock.expectOne(`${apiUrl}/attendance`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, data: mockRecord });
  });

  it('should record check-out', () => {
    const checkOutTime = '2026-05-10T11:00:00.000Z';
    service.checkOut('att1', { checkOutTime }).subscribe((res) => {
      expect(res.checkOutTime).toBe(checkOutTime);
    });

    const req = httpMock.expectOne(`${apiUrl}/attendance/att1/checkout`);
    expect(req.request.method).toBe('PATCH');
    req.flush({
      success: true,
      data: { _id: 'att1', checkOutTime },
    });
  });

  it('should get member attendance', () => {
    service.getMemberAttendance('mem123').subscribe((res) => {
      expect(res.data.length).toBe(0);
    });

    const req = httpMock.expectOne(`${apiUrl}/attendance/member/mem123`);
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 1,
      count: 0,
      data: [],
    });
  });

  it('should delete attendance record', () => {
    service.deleteAttendance('att1').subscribe((res) => {
      expect(res).toBeUndefined();
    });

    const req = httpMock.expectOne(`${apiUrl}/attendance/att1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Deleted' });
  });
});

