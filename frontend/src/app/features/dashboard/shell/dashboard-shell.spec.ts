import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DashboardShell } from './dashboard-shell';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/auth.models';

describe('DashboardShell Component - Sidebar Navigation', () => {
  let component: DashboardShell;
  let fixture: ComponentFixture<DashboardShell>;

  const mockAdminUser: User = {
    _id: 'admin1',
    fullName: 'Admin User',
    email: 'admin@test.com',
    phone: '1112223333',
    gender: 'male',
    dateOfBirth: '1985-01-01',
    role: 'admin',
  };

  const mockAuthService = {
    logout: vi.fn(),
    currentUser: signal<User | null>(mockAdminUser),
    userRole: signal<'admin' | 'trainer' | 'member'>('admin'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardShell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardShell);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the dashboard shell', () => {
    expect(component).toBeTruthy();
  });

  it('should render Members navigation link pointing to /dashboard/admin/members', () => {
    const el = fixture.nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll('.sidebar-nav a'));
    const membersLink = links.find((l) => l.textContent?.includes('Members'));

    expect(membersLink).toBeTruthy();
    expect(membersLink?.getAttribute('routerLink')).toBe('/dashboard/admin/members');
  });

  it('should render Trainers navigation link pointing to /dashboard/admin/trainers', () => {
    const el = fixture.nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll('.sidebar-nav a'));
    const trainersLink = links.find((l) => l.textContent?.includes('Trainers'));

    expect(trainersLink).toBeTruthy();
    expect(trainersLink?.getAttribute('routerLink')).toBe('/dashboard/admin/trainers');
  });
});
