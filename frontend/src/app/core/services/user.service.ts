import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { User } from '../models/auth.models';

export interface AdminStats {
  totalMembers: number;
  totalTrainers: number;
  activeMemberships: number;
  totalPayments: number;
  totalRevenue: number;
  recentMembers: User[];
}

export interface AssignedMemberSummary {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  gender?: string;
  profileImage?: string;
  assignedDate: string;
  assignedWorkoutsCount: number;
  completedWorkoutsCount: number;
  activeWorkoutsCount: number;
  completionRate: number;
}

export interface TrainerActivityItem {
  id: string;
  type: 'member_assigned' | 'workout_assigned' | 'workout_completed';
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    memberId?: string;
    memberName?: string;
    workoutId?: string;
  };
}

export interface TrainerStatistics {
  totalAssignedMembers: number;
  activeWorkoutRoutines: number;
  completedWorkoutSessions: number;
  overallCompletionRate: number;
  totalWorkouts: number;
}

export interface TrainerOverview {
  totalAssignedMembers: number;
  totalWorkouts: number;
  activeWorkoutRoutines: number;
  completedWorkoutSessions: number;
  overallCompletionRate: number;
  statistics?: TrainerStatistics;
  assignedMembers: AssignedMemberSummary[];
  workouts: WorkoutSummary[];
  recentActivities: TrainerActivityItem[];
}

export interface MemberOverview {
  totalWorkouts: number;
  activePlan: MembershipPlan | null;
  workouts: WorkoutSummary[];
  payments: Payment[];
}

export interface WorkoutSummary {
  _id: string;
  workoutName: string;
  description: string;
  category: string;
  duration: number;
  assignedMember?: User;
  assignedTrainer?: User;
  createdAt: string;
}

export interface MembershipPlan {
  _id: string;
  planName: string;
  duration: number;
  price: number;
  features: string[];
  status: string;
}

export interface Payment {
  _id: string;
  amount: number;
  paymentStatus: string;
  transactionReference: string;
  paymentDate: string;
  membership?: MembershipPlan;
}

export interface UsersListResponse {
  success: boolean;
  count: number;
  data: User[];
}

export interface UserFilters {
  role?: string;
  gender?: string;
  search?: string;
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  gender: string;
  dateOfBirth: string;
  role: string;
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  role?: string;
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getAdminStats(): Observable<AdminStats> {
    return this.http
      .get<{ success: boolean; data: AdminStats }>(`${this.apiUrl}/users/admin/stats`)
      .pipe(map((r) => r.data));
  }

  getTrainerOverview(): Observable<TrainerOverview> {
    return this.http
      .get<{ success: boolean; data: TrainerOverview }>(`${this.apiUrl}/users/trainer/overview`)
      .pipe(map((r) => r.data));
  }

  getMemberOverview(): Observable<MemberOverview> {
    return this.http
      .get<{ success: boolean; data: MemberOverview }>(`${this.apiUrl}/users/member/overview`)
      .pipe(map((r) => r.data));
  }

  getUsers(filters: UserFilters = {}): Observable<User[]> {
    let params = new HttpParams();
    if (filters.role) params = params.set('role', filters.role);
    if (filters.gender) params = params.set('gender', filters.gender);
    if (filters.search) params = params.set('search', filters.search);
    return this.http
      .get<UsersListResponse>(`${this.apiUrl}/users`, { params })
      .pipe(map((r) => r.data));
  }

  getUserById(id: string): Observable<User> {
    return this.http
      .get<{ success: boolean; data: User }>(`${this.apiUrl}/users/${id}`)
      .pipe(map((r) => r.data));
  }

  createUser(payload: CreateUserPayload): Observable<User> {
    return this.http
      .post<{ success: boolean; data: User }>(`${this.apiUrl}/users`, payload)
      .pipe(map((r) => r.data));
  }

  updateUser(id: string, payload: UpdateUserPayload): Observable<User> {
    return this.http
      .patch<{ success: boolean; data: User }>(`${this.apiUrl}/users/${id}`, payload)
      .pipe(map((r) => r.data));
  }

  deleteUser(id: string): Observable<void> {
    return this.http
      .delete<{ success: boolean }>(`${this.apiUrl}/users/${id}`)
      .pipe(map(() => void 0));
  }
}

