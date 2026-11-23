import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ReportSummary {
  totalMembers: number;
  totalTrainers: number;
  activeMemberships: number;
  expiredMemberships: number;
  totalRevenue: number;
  pendingRevenue: number;
  totalCheckIns: number;
  totalWorkouts: number;
}

export interface MembershipReportPlan {
  _id: string;
  planName: string;
  price: number;
  duration: number;
  status: string;
  subscribersCount: number;
  totalRevenue: number;
}

export interface MembershipReport {
  totalPlans: number;
  activePlans: number;
  inactivePlans: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  plans: MembershipReportPlan[];
}

export interface PaymentReportItem {
  _id: string;
  amount: number;
  paymentStatus: 'paid' | 'pending' | 'failed';
  transactionReference: string;
  paymentDate: string;
  member?: {
    _id: string;
    fullName: string;
    email: string;
    phone?: string;
  };
  membership?: {
    _id: string;
    planName: string;
    price: number;
  };
}

export interface PaymentReport {
  totalRevenue: number;
  pendingAmount: number;
  failedAmount: number;
  totalCount: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  payments: PaymentReportItem[];
}

export interface AttendanceReportItem {
  _id: string;
  attendanceDate: string;
  checkInTime: string;
  checkOutTime?: string;
  status: 'present' | 'absent' | 'late';
  member?: {
    _id: string;
    fullName: string;
    email: string;
    phone?: string;
  };
}

export interface AttendanceReport {
  totalRecords: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  uniqueMembersAttended: number;
  records: AttendanceReportItem[];
}

export interface RegistrationReportItem {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  gender?: string;
  createdAt: string;
}

export interface RegistrationReport {
  totalRegistrations: number;
  membersCount: number;
  trainersCount: number;
  registrations: RegistrationReportItem[];
}

export interface ReportData {
  type: string;
  summary: ReportSummary;
  membershipReport?: MembershipReport;
  paymentReport?: PaymentReport;
  attendanceReport?: AttendanceReport;
  registrationReport?: RegistrationReport;
}

export interface ReportFilterParams {
  type?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/reports`;

  getReports(filters?: ReportFilterParams): Observable<ReportData> {
    let params = new HttpParams();

    if (filters) {
      if (filters.type && filters.type !== 'all') {
        params = params.set('type', filters.type);
      }
      if (filters.startDate) {
        params = params.set('startDate', filters.startDate);
      }
      if (filters.endDate) {
        params = params.set('endDate', filters.endDate);
      }
      if (filters.status && filters.status !== 'all') {
        params = params.set('status', filters.status);
      }
    }

    return this.http
      .get<{ success: boolean; data: ReportData }>(this.baseUrl, { params })
      .pipe(map((res) => res.data));
  }
}

