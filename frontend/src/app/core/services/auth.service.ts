import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
  UserProfileResponse,
  UserRole,
} from '../models/auth.models';

const TOKEN_KEY = 'fitnova_token';
const USER_KEY = 'fitnova_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = environment.apiUrl;

  private readonly tokenSignal = signal<string | null>(this.readInitialToken());
  private readonly currentUserSignal = signal<User | null>(this.readInitialUser());

  public readonly token = this.tokenSignal.asReadonly();
  public readonly currentUser = this.currentUserSignal.asReadonly();
  public readonly isLoggedIn = computed(() => Boolean(this.tokenSignal() && this.currentUserSignal()));
  public readonly userRole = computed<UserRole | null>(() => this.currentUserSignal()?.role ?? null);

  public register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/register`, payload)
      .pipe(tap((response) => this.setSession(response.token, response.data)));
  }

  public login(credentials: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/login`, credentials)
      .pipe(tap((response) => this.setSession(response.token, response.data)));
  }

  public fetchProfile(): Observable<User> {
    return this.http
      .get<UserProfileResponse>(`${this.apiUrl}/users/me`)
      .pipe(
        tap((response) => {
          this.currentUserSignal.set(response.data);
          this.writeStorage(USER_KEY, JSON.stringify(response.data));
        }),
        map((response) => response.data),
      );
  }

  public updateProfile(payload: {
    fullName?: string;
    phone?: string;
    gender?: string;
    dateOfBirth?: string;
    profileImage?: string;
    specialization?: string;
    experienceYears?: number;
    bio?: string;
    certifications?: string[];
    currentPassword?: string;
    newPassword?: string;
  }): Observable<User> {
    return this.http
      .patch<UserProfileResponse>(`${this.apiUrl}/users/me`, payload)
      .pipe(
        tap((response) => {
          this.currentUserSignal.set(response.data);
          this.writeStorage(USER_KEY, JSON.stringify(response.data));
        }),
        map((response) => response.data),
      );
  }

  public logout(redirectTo: string = '/login'): void {
    this.clearSession();
    this.router.navigateByUrl(redirectTo);
  }

  public getToken(): string | null {
    return this.tokenSignal();
  }

  public getCurrentUser(): User | null {
    return this.currentUserSignal();
  }

  public hasRole(roles: UserRole | UserRole[]): boolean {
    const current = this.currentUserSignal();
    if (!current) {
      return false;
    }
    const roleList = Array.isArray(roles) ? roles : [roles];
    return roleList.includes(current.role);
  }

  private setSession(token: string, user: User): void {
    this.writeStorage(TOKEN_KEY, token);
    this.writeStorage(USER_KEY, JSON.stringify(user));
    this.tokenSignal.set(token);
    this.currentUserSignal.set(user);
  }

  private clearSession(): void {
    this.removeStorage(TOKEN_KEY);
    this.removeStorage(USER_KEY);
    this.tokenSignal.set(null);
    this.currentUserSignal.set(null);
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private readInitialToken(): string | null {
    if (!this.isBrowser()) {
      return null;
    }
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private readInitialUser(): User | null {
    if (!this.isBrowser()) {
      return null;
    }
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    if (this.isBrowser()) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Storage quota or privacy sandbox errors ignored safely
      }
    }
  }

  private removeStorage(key: string): void {
    if (this.isBrowser()) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignored safely
      }
    }
  }
}

