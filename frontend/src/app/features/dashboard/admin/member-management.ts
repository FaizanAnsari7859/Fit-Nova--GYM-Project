import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { User } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import {
  CreateUserPayload,
  UpdateUserPayload,
  UserFilters,
  UserService,
} from '../../../core/services/user.service';

export type RoleTab = 'member' | 'trainer' | 'admin';
type ModalMode = 'add' | 'edit' | 'view' | 'delete' | null;

const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const pw = control.get('password')?.value as string;
  const cpw = control.get('confirmPassword')?.value as string;
  if (pw && cpw && pw !== cpw) return { passwordMismatch: true };
  return null;
};

@Component({
  selector: 'app-member-management',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './member-management.html',
  styleUrl: './member-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberManagement implements OnInit {
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);

  public readonly currentUser = this.authService.currentUser;

  // Tabs
  public readonly activeTab = signal<RoleTab>('member');
  public readonly memberCount = signal<number>(0);
  public readonly trainerCount = signal<number>(0);
  public readonly adminCount = signal<number>(0);

  // State
  public readonly loading = signal(true);
  public readonly submitting = signal(false);
  public readonly users = signal<User[]>([]);
  public readonly error = signal<string | null>(null);
  public readonly success = signal<string | null>(null);
  public readonly trainers = signal<User[]>([]);

  public readonly modalMode = signal<ModalMode>(null);
  public readonly selectedUser = signal<User | null>(null);

  // Filters & Search
  public readonly searchValue = signal('');
  public readonly genderFilter = signal('');
  public readonly trainerFilter = signal<'all' | 'assigned' | 'unassigned'>('all');

  // Pagination
  public readonly currentPage = signal(1);
  public readonly pageSize = signal(10);
  public readonly totalCount = signal(0);
  public readonly totalPages = signal(1);

  // Forms
  public readonly addForm = new FormGroup(
    {
      fullName: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(80),
        ],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      phone: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.pattern(/^\d{10,15}$/),
        ],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      gender: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      dateOfBirth: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      role: new FormControl<RoleTab>('member', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      assignedTrainer: new FormControl('', { nonNullable: true }),
      specialization: new FormControl('', { nonNullable: true }),
      experienceYears: new FormControl<number | null>(null),
      bio: new FormControl('', { nonNullable: true }),
    },
    { validators: passwordMatchValidator },
  );

  public readonly editForm = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(80),
      ],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\d{10,15}$/),
      ],
    }),
    gender: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    dateOfBirth: new FormControl('', { nonNullable: true }),
    role: new FormControl<RoleTab>('member', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password: new FormControl('', { nonNullable: true }),
    assignedTrainer: new FormControl('', { nonNullable: true }),
    specialization: new FormControl('', { nonNullable: true }),
    experienceYears: new FormControl<number | null>(null),
    bio: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadUsers(1);
    this.loadTrainers();
    this.loadTabCounts();
  }

  public setTab(tab: RoleTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.currentPage.set(1);
    this.loadUsers(1);
  }

  public loadTrainers(): void {
    this.userService.getUsers({ role: 'trainer' }).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
        this.trainers.set(list);
      },
      error: () => { /* non-critical */ },
    });
  }

  public loadTabCounts(): void {
    this.userService.getUsers({ role: 'member' }).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
        this.memberCount.set(list.length);
      },
      error: () => { },
    });
    this.userService.getUsers({ role: 'trainer' }).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
        this.trainerCount.set(list.length);
      },
      error: () => { },
    });
    this.userService.getUsers({ role: 'admin' }).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
        this.adminCount.set(list.length);
      },
      error: () => { },
    });
  }

  public loadUsers(page: number = this.currentPage()): void {
    this.loading.set(true);
    this.error.set(null);

    const filters: UserFilters = {
      role: this.activeTab(),
      search: this.searchValue().trim(),
      gender: this.genderFilter(),
      page,
      limit: this.pageSize(),
    };

    // Use getUsersPaged if available, otherwise getUsers
    const req$ = typeof (this.userService as any).getUsersPaged === 'function'
      ? (this.userService as any).getUsersPaged(filters)
      : this.userService.getUsers(filters);

    req$.subscribe({
      next: (res: any) => {
        let rawList: User[] = Array.isArray(res) ? res : (res?.data ?? []);

        // Filter by trainer assignment if on member tab
        if (this.activeTab() === 'member' && this.trainerFilter() !== 'all') {
          if (this.trainerFilter() === 'assigned') {
            rawList = rawList.filter((u) => !!u.assignedTrainer);
          } else if (this.trainerFilter() === 'unassigned') {
            rawList = rawList.filter((u) => !u.assignedTrainer);
          }
        }

        this.users.set(rawList);

        const total = Array.isArray(res)
          ? rawList.length
          : (res?.total ?? res?.count ?? rawList.length);
        this.totalCount.set(total);

        const pages = Array.isArray(res)
          ? Math.max(1, Math.ceil(rawList.length / this.pageSize()))
          : (res?.totalPages ?? Math.max(1, Math.ceil(total / this.pageSize())));
        this.totalPages.set(pages);

        this.currentPage.set(page);
        this.loading.set(false);

        // Keep active tab count current when unfiltered
        if (!this.searchValue() && !this.genderFilter() && this.trainerFilter() === 'all') {
          if (this.activeTab() === 'member') this.memberCount.set(total);
          else if (this.activeTab() === 'trainer') this.trainerCount.set(total);
          else if (this.activeTab() === 'admin') this.adminCount.set(total);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to load users.');
        this.loading.set(false);
      },
    });
  }

  // Filter & Search Handlers
  public onSearchChange(event: Event): void {
    this.searchValue.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
    this.loadUsers(1);
  }

  public onGenderChange(event: Event): void {
    this.genderFilter.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
    this.loadUsers(1);
  }

  public onTrainerFilterChange(event: Event): void {
    this.trainerFilter.set((event.target as HTMLSelectElement).value as any);
    this.currentPage.set(1);
    this.loadUsers(1);
  }

  // Pagination Handlers
  public goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages() && page !== this.currentPage()) {
      this.loadUsers(page);
    }
  }

  public previousPage(): void {
    if (this.currentPage() > 1) {
      this.goToPage(this.currentPage() - 1);
    }
  }

  public nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.goToPage(this.currentPage() + 1);
    }
  }

  // Modal Open Handlers
  public openAdd(): void {
    const defaultRole = this.activeTab();
    this.addForm.reset({
      role: defaultRole,
      assignedTrainer: '',
      specialization: '',
      experienceYears: null,
      bio: '',
    });
    this.error.set(null);
    this.success.set(null);
    this.modalMode.set('add');
  }

  public openEdit(user: User): void {
    this.selectedUser.set(user);
    this.error.set(null);
    this.success.set(null);

    const dob = user.dateOfBirth
      ? new Date(user.dateOfBirth).toISOString().split('T')[0]
      : '';
    const assignedTrainerId =
      user.assignedTrainer
        ? (typeof user.assignedTrainer === 'string'
          ? user.assignedTrainer
          : (user.assignedTrainer as User)._id)
        : '';

    this.editForm.reset({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      dateOfBirth: dob,
      role: user.role as RoleTab,
      password: '',
      assignedTrainer: assignedTrainerId,
      specialization: (user as any).specialization ?? '',
      experienceYears: (user as any).experienceYears ?? null,
      bio: (user as any).bio ?? '',
    });
    this.modalMode.set('edit');
  }

  public openView(user: User): void {
    this.selectedUser.set(user);
    this.modalMode.set('view');
  }

  public openDelete(user: User): void {
    if (this.isCurrentUser(user)) {
      this.error.set('You cannot delete your own admin account.');
      return;
    }
    this.selectedUser.set(user);
    this.error.set(null);
    this.modalMode.set('delete');
  }

  public closeModal(): void {
    this.modalMode.set(null);
    this.selectedUser.set(null);
  }

  // CRUD Submissions
  public submitAdd(): void {
    this.error.set(null);
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const v = this.addForm.getRawValue();
    const payload: CreateUserPayload = {
      fullName: v.fullName,
      email: v.email,
      phone: v.phone,
      password: v.password,
      confirmPassword: v.confirmPassword,
      gender: v.gender,
      dateOfBirth: v.dateOfBirth,
      role: v.role,
    };

    if (v.role === 'member' && v.assignedTrainer) {
      (payload as any).assignedTrainer = v.assignedTrainer;
    }
    if (v.role === 'trainer') {
      if (v.specialization) (payload as any).specialization = v.specialization;
      if (v.experienceYears !== null) (payload as any).experienceYears = v.experienceYears;
      if (v.bio) (payload as any).bio = v.bio;
    }

    this.userService.createUser(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set(`${this.capitalize(v.role)} created successfully.`);
        this.loadUsers(1);
        this.loadTabCounts();
        if (v.role === 'trainer') this.loadTrainers();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to create user.');
      },
    });
  }

  public submitEdit(): void {
    this.error.set(null);
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const user = this.selectedUser();
    if (!user) return;

    this.submitting.set(true);
    const v = this.editForm.getRawValue();

    // Lock role to the user's existing role to prevent accidental role changes
    const payload: UpdateUserPayload = {
      fullName: v.fullName,
      email: v.email,
      phone: v.phone,
      gender: v.gender,
      dateOfBirth: v.dateOfBirth || undefined,
      role: user.role, // Preserves role strictly
    };

    if (v.password) payload.password = v.password;

    if (user.role === 'member') {
      payload.assignedTrainer = v.assignedTrainer || null;
    }

    if (user.role === 'trainer') {
      if (v.specialization !== undefined) payload.specialization = v.specialization;
      if (v.experienceYears !== null && v.experienceYears !== undefined) {
        payload.experienceYears = v.experienceYears;
      }
      if (v.bio !== undefined) payload.bio = v.bio;
    }

    this.userService.updateUser(user._id, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('User updated successfully.');
        this.loadUsers(this.currentPage());
        this.loadTabCounts();
        if (user.role === 'trainer') this.loadTrainers();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to update user.');
      },
    });
  }

  public confirmDelete(): void {
    const user = this.selectedUser();
    if (!user) return;

    if (this.isCurrentUser(user)) {
      this.error.set('You cannot delete your own admin account.');
      return;
    }

    this.submitting.set(true);
    this.userService.deleteUser(user._id).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('User deleted successfully.');
        // Adjust page if this was the last item on current page
        const newPage = (this.users().length === 1 && this.currentPage() > 1)
          ? this.currentPage() - 1
          : this.currentPage();
        this.loadUsers(newPage);
        this.loadTabCounts();
        if (user.role === 'trainer') this.loadTrainers();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to delete user.');
      },
    });
  }

  // Helpers
  public isCurrentUser(user: User): boolean {
    const me = this.currentUser();
    return !!me && (user._id === me._id || user.email === me.email);
  }

  public getTrainerName(user: User): string {
    if (!user.assignedTrainer) return 'Unassigned';
    if (typeof user.assignedTrainer === 'object' && (user.assignedTrainer as User).fullName) {
      return (user.assignedTrainer as User).fullName;
    }
    const found = this.trainers().find((t) => t._id === user.assignedTrainer);
    return found ? found.fullName : 'Assigned';
  }

  public getTrainerSpecialization(user: User | null): string {
    return (user as any)?.specialization || '';
  }

  public getTrainerExperience(user: User | null): number | null {
    const exp = (user as any)?.experienceYears;
    return typeof exp === 'number' ? exp : null;
  }

  public getTrainerBio(user: User | null): string {
    return (user as any)?.bio || '';
  }

  public getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  public getRoleBadgeClass(role: string): string {
    return `badge badge-${role}`;
  }

  public capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  public isAddInvalid(field: string): boolean {
    const c = this.addForm.get(field);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  public isEditInvalid(field: string): boolean {
    const c = this.editForm.get(field);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  public get addPasswordMismatch(): boolean {
    return !!(
      this.addForm.errors?.['passwordMismatch'] &&
      (this.addForm.get('confirmPassword')?.touched ||
        this.addForm.get('confirmPassword')?.dirty)
    );
  }
}
