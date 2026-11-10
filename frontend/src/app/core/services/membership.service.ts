import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface MembershipPlan {
  _id: string;
  planName: string;
  description?: string;
  duration: number;
  price: number;
  features: string[];
  status: 'active' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePlanPayload {
  planName: string;
  description?: string;
  duration: number;
  price: number;
  features: string[];
  status: 'active' | 'inactive';
}

export interface UpdatePlanPayload {
  planName?: string;
  description?: string;
  duration?: number;
  price?: number;
  features?: string[];
  status?: 'active' | 'inactive';
}

export interface AssignPlanPayload {
  memberId: string;
  amount?: number;
  paymentStatus?: 'paid' | 'pending';
}

@Injectable({ providedIn: 'root' })
export class MembershipService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getPlans(status?: string): Observable<MembershipPlan[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http
      .get<{ success: boolean; data: MembershipPlan[] }>(`${this.apiUrl}/memberships`, { params })
      .pipe(map((r) => r.data));
  }

  getPlan(id: string): Observable<MembershipPlan> {
    return this.http
      .get<{ success: boolean; data: MembershipPlan }>(`${this.apiUrl}/memberships/${id}`)
      .pipe(map((r) => r.data));
  }

  createPlan(payload: CreatePlanPayload): Observable<MembershipPlan> {
    return this.http
      .post<{ success: boolean; data: MembershipPlan }>(`${this.apiUrl}/memberships`, payload)
      .pipe(map((r) => r.data));
  }

  updatePlan(id: string, payload: UpdatePlanPayload): Observable<MembershipPlan> {
    return this.http
      .patch<{ success: boolean; data: MembershipPlan }>(`${this.apiUrl}/memberships/${id}`, payload)
      .pipe(map((r) => r.data));
  }

  deletePlan(id: string): Observable<void> {
    return this.http
      .delete<{ success: boolean }>(`${this.apiUrl}/memberships/${id}`)
      .pipe(map(() => void 0));
  }

  assignPlan(planId: string, payload: AssignPlanPayload): Observable<any> {
    return this.http
      .post<{ success: boolean; message: string; data: any }>(
        `${this.apiUrl}/memberships/${planId}/assign`,
        payload,
      )
      .pipe(map((r) => r.data));
  }
}

