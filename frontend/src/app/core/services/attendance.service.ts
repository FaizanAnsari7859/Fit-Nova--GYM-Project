import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AttendanceMember {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  profileImage?: string;
  assignedTrainer?: string;
}

export interface AttendanceRecord {
  _id: string;
  member: AttendanceMember | string;
  checkInTime: string; // ISO string
  checkOutTime: string | null; // ISO string or null
  attendanceDate: string; // ISO string
  status: 'present' | 'absent' | 'late';
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceListResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  count: number;
  data: AttendanceRecord[];
}

export interface AttendanceFilter {
  member?: string;
  memberId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface CheckInPayload {
  member: string;
  checkInTime?: string;
  attendanceDate?: string;
  status?: 'present' | 'absent' | 'late';
  checkOutTime?: string;
}

export interface CheckOutPayload {
  checkOutTime?: string;
}

export interface UpdateAttendancePayload {
  status?: 'present' | 'absent' | 'late';
  checkInTime?: string;
  checkOutTime?: string;
  attendanceDate?: string;
}

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listAttendance(filter?: AttendanceFilter): Observable<AttendanceListResponse> {
    let params = new HttpParams();
    if (filter) {
      if (filter.member) params = params.set('member', filter.member);
      if (filter.memberId) params = params.set('memberId', filter.memberId);
      if (filter.date) params = params.set('date', filter.date);
      if (filter.startDate) params = params.set('startDate', filter.startDate);
      if (filter.endDate) params = params.set('endDate', filter.endDate);
      if (filter.status) params = params.set('status', filter.status);
      if (filter.page) params = params.set('page', filter.page.toString());
      if (filter.limit) params = params.set('limit', filter.limit.toString());
    }
    return this.http.get<AttendanceListResponse>(`${this.apiUrl}/attendance`, { params });
  }

  getAttendance(id: string): Observable<AttendanceRecord> {
    return this.http
      .get<{ success: boolean; data: AttendanceRecord }>(`${this.apiUrl}/attendance/${id}`)
      .pipe(map((r) => r.data));
  }

  getMemberAttendance(memberId: string, filter?: AttendanceFilter): Observable<AttendanceListResponse> {
    let params = new HttpParams();
    if (filter) {
      if (filter.date) params = params.set('date', filter.date);
      if (filter.startDate) params = params.set('startDate', filter.startDate);
      if (filter.endDate) params = params.set('endDate', filter.endDate);
      if (filter.status) params = params.set('status', filter.status);
      if (filter.page) params = params.set('page', filter.page.toString());
      if (filter.limit) params = params.set('limit', filter.limit.toString());
    }
    return this.http.get<AttendanceListResponse>(`${this.apiUrl}/attendance/member/${memberId}`, { params });
  }

  checkIn(payload: CheckInPayload): Observable<AttendanceRecord> {
    return this.http
      .post<{ success: boolean; data: AttendanceRecord }>(`${this.apiUrl}/attendance`, payload)
      .pipe(map((r) => r.data));
  }

  checkOut(id: string, payload?: CheckOutPayload): Observable<AttendanceRecord> {
    return this.http
      .patch<{ success: boolean; data: AttendanceRecord }>(`${this.apiUrl}/attendance/${id}/checkout`, payload || {})
      .pipe(map((r) => r.data));
  }

  updateAttendance(id: string, payload: UpdateAttendancePayload): Observable<AttendanceRecord> {
    return this.http
      .patch<{ success: boolean; data: AttendanceRecord }>(`${this.apiUrl}/attendance/${id}`, payload)
      .pipe(map((r) => r.data));
  }

  deleteAttendance(id: string): Observable<void> {
    return this.http
      .delete<{ success: boolean; message: string }>(`${this.apiUrl}/attendance/${id}`)
      .pipe(map(() => void 0));
  }
}

