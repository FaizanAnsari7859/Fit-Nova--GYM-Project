import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the FitNova site', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    await router.navigate(['/']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('FitNova');
  });

  it('should configure correct admin routes for members and trainers', () => {
    const dashboardRoute = routes.find((r) => r.path === 'dashboard');
    expect(dashboardRoute).toBeDefined();

    const children = dashboardRoute?.children || [];
    const membersRoute = children.find((r) => r.path === 'admin/members');
    expect(membersRoute).toBeDefined();
    expect(membersRoute?.data?.['roles']).toContain('admin');

    const trainersRoute = children.find((r) => r.path === 'admin/trainers');
    expect(trainersRoute).toBeDefined();
    expect(trainersRoute?.data?.['roles']).toContain('admin');

    const membersRedirect = children.find((r) => r.path === 'members');
    expect(membersRedirect?.redirectTo).toBe('admin/members');

    const trainersRedirect = children.find((r) => r.path === 'trainers');
    expect(trainersRedirect?.redirectTo).toBe('admin/trainers');
  });
});
