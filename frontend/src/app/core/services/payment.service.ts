import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface PaymentMember {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
}

export interface PaymentMembership {
  _id: string;
  planName: string;
  price: number;
  duration?: number;
}

export interface Payment {
  _id: string;
  member: PaymentMember | string;
  membership: PaymentMembership | string;
  amount: number;
  paymentStatus: 'pending' | 'paid' | 'failed';
  transactionReference: string;
  receiptUrl?: string;
  paymentDate: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReceiptData {
  receiptUrl: string;
  transactionReference: string;
  amount: number;
  paymentDate: string;
  paymentStatus: string;
  member?: {
    _id?: string;
    fullName?: string;
    email?: string;
    phone?: string;
  };
  membership?: {
    _id?: string;
    planName?: string;
    price?: number;
    duration?: number;
  };
}

export interface PaymentListResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  count: number;
  data: Payment[];
}

export interface PaymentFilter {
  member?: string;
  memberId?: string;
  status?: string;
  paymentStatus?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface CreatePaymentPayload {
  member: string;
  membership: string;
  amount: number;
  paymentStatus?: 'pending' | 'paid' | 'failed';
  transactionReference?: string;
  paymentDate: string;
  receiptUrl?: string;
}

export interface UpdatePaymentPayload {
  paymentStatus?: 'pending' | 'paid' | 'failed';
  amount?: number;
  paymentDate?: string;
  transactionReference?: string;
  receiptUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listPayments(filter?: PaymentFilter): Observable<PaymentListResponse> {
    let params = new HttpParams();
    if (filter) {
      if (filter.member) params = params.set('member', filter.member);
      if (filter.memberId) params = params.set('memberId', filter.memberId);
      if (filter.status) params = params.set('status', filter.status);
      if (filter.paymentStatus) params = params.set('paymentStatus', filter.paymentStatus);
      if (filter.startDate) params = params.set('startDate', filter.startDate);
      if (filter.endDate) params = params.set('endDate', filter.endDate);
      if (filter.page) params = params.set('page', filter.page.toString());
      if (filter.limit) params = params.set('limit', filter.limit.toString());
    }
    return this.http.get<PaymentListResponse>(`${this.apiUrl}/payments`, { params });
  }

  // Alias for getPayments returning simple array
  getPayments(filter?: PaymentFilter): Observable<Payment[]> {
    return this.listPayments(filter).pipe(map((r) => r.data));
  }

  getPayment(id: string): Observable<Payment> {
    return this.http
      .get<{ success: boolean; data: Payment }>(`${this.apiUrl}/payments/${id}`)
      .pipe(map((r) => r.data));
  }

  createPayment(payload: CreatePaymentPayload): Observable<Payment> {
    return this.http
      .post<{ success: boolean; data: Payment }>(`${this.apiUrl}/payments`, payload)
      .pipe(map((r) => r.data));
  }

  updatePayment(id: string, payload: UpdatePaymentPayload): Observable<Payment> {
    return this.http
      .patch<{ success: boolean; data: Payment }>(`${this.apiUrl}/payments/${id}`, payload)
      .pipe(map((r) => r.data));
  }

  deletePayment(id: string): Observable<void> {
    return this.http
      .delete<{ success: boolean; message: string }>(`${this.apiUrl}/payments/${id}`)
      .pipe(map(() => void 0));
  }

  getReceipt(id: string): Observable<ReceiptData> {
    return this.http
      .get<{ success: boolean; data: ReceiptData }>(`${this.apiUrl}/payments/${id}/receipt`)
      .pipe(map((r) => r.data));
  }
}
