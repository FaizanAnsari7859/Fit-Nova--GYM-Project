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
  expiredMemberships?: number;
  totalPayments: number;
  totalRevenue: number;
  pendingPayments?: number;
  pendingRevenue?: number;
  todayAttendance?: number;
  recentMembers: User[];
  recentPayments?: any[];
  recentAttendance?: any[];
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
  attendanceCount?: number;
  presentCount?: number;
  lastAttendance?: string | null;
}

export interface TrainerActivityItem {
  id: string;
  type: 'member_assigned' | 'workout_assigned' | 'workout_completed' | 'member_attendance';
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
  todayAttendanceCount?: number;
}

export interface TrainerOverview {
  totalAssignedMembers: number;
  totalWorkouts: number;
  activeWorkoutRoutines: number;
  completedWorkoutSessions: number;
  overallCompletionRate: number;
  todayAttendanceCount?: number;
  totalAttendanceRecords?: number;
  recentAttendance?: any[];
  statistics?: TrainerStatistics;
  assignedMembers: AssignedMemberSummary[];
  workouts: WorkoutSummary[];
  recentActivities: TrainerActivityItem[];
}

export interface MemberPaymentSummary {
  totalPaid: number;
  pendingCount: number;
  totalCount: number;
  payments: Payment[];
}

export interface MemberAttendanceSummary {
  totalAttendance: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  attendanceRate: number;
  lastCheckIn: string | null;
  recentAttendance: any[];
}

export interface MemberWorkoutProgress {
  totalWorkouts: number;
  completedWorkouts: number;
  activeWorkouts: number;
  completionRate: number;
}

export interface MemberOverview {
  totalWorkouts: number;
  activePlan: MembershipPlan | null;
  workouts: WorkoutSummary[];
  payments: Payment[];
  attendance?: any[];
  membershipStatus?: 'active' | 'expired' | 'none';
  membershipExpiry?: string | null;
  daysRemaining?: number | null;
  paymentSummary?: MemberPaymentSummary;
  attendanceSummary?: MemberAttendanceSummary;
  workoutSummary?: MemberWorkoutProgress;
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
  total?: number;
  page?: number;
  totalPages?: number;
  limit?: number;
}

export interface AssignedMemberItem {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  gender?: string;
  profileImage?: string;
  membershipStatus?: 'active' | 'expired' | 'none';
  createdAt?: string;
}

export interface TrainerAssignmentItem {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  specialization?: string;
  profileImage?: string;
  assignedMembersCount: number;
  assignedMembers: AssignedMemberItem[];
}

export interface TrainerAssignmentsOverview {
  totalTrainers: number;
  totalAssignedMembers: number;
  totalUnassignedMembers: number;
  trainers: TrainerAssignmentItem[];
  unassignedMembers: AssignedMemberItem[];
}

export interface UserFilters {
  role?: string;
  gender?: string;
  search?: string;
  page?: number;
  limit?: number;
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
  specialization?: string;
  experienceYears?: number;
  bio?: string;
  assignedTrainer?: string | null;
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

  getTrainerAssignmentsOverview(): Observable<TrainerAssignmentsOverview> {
    return this.http
      .get<{ success: boolean; data: TrainerAssignmentsOverview }>(
        `${this.apiUrl}/users/admin/trainer-assignments`,
      )
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
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.limit) params = params.set('limit', filters.limit.toString());
    return this.http
      .get<UsersListResponse>(`${this.apiUrl}/users`, { params })
      .pipe(map((r) => r.data));
  }

  getUsersPaged(filters: UserFilters = {}): Observable<UsersListResponse> {
    let params = new HttpParams();
    if (filters.role) params = params.set('role', filters.role);
    if (filters.gender) params = params.set('gender', filters.gender);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.limit) params = params.set('limit', filters.limit.toString());
    return this.http.get<UsersListResponse>(`${this.apiUrl}/users`, { params });
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

