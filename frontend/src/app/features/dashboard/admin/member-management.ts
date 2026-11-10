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
import {
  CreateUserPayload,
  UpdateUserPayload,
  UserService,
} from '../../../core/services/user.service';

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

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly users = signal<User[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly modalMode = signal<ModalMode>(null);
  protected readonly selectedUser = signal<User | null>(null);

  // Filters
  protected readonly searchValue = signal('');
  protected readonly roleFilter = signal('');
  protected readonly genderFilter = signal('');

  protected readonly addForm = new FormGroup(
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
      role: new FormControl('member', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordMatchValidator },
  );

  protected readonly editForm = new FormGroup({
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
    role: new FormControl('member', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  protected loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);
    const filters = {
      search: this.searchValue(),
      role: this.roleFilter(),
      gender: this.genderFilter(),
    };
    this.userService.getUsers(filters).subscribe({
      next: (data) => {
        this.users.set(data);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to load users.');
        this.loading.set(false);
      },
    });
  }

  protected onSearchChange(event: Event): void {
    this.searchValue.set((event.target as HTMLInputElement).value);
    this.loadUsers();
  }

  protected onRoleChange(event: Event): void {
    this.roleFilter.set((event.target as HTMLSelectElement).value);
    this.loadUsers();
  }

  protected onGenderChange(event: Event): void {
    this.genderFilter.set((event.target as HTMLSelectElement).value);
    this.loadUsers();
  }

  // Modal open helpers
  protected openAdd(): void {
    this.addForm.reset({ role: 'member' });
    this.error.set(null);
    this.success.set(null);
    this.modalMode.set('add');
  }

  protected openEdit(user: User): void {
    this.selectedUser.set(user);
    this.error.set(null);
    this.success.set(null);
    const dob = user.dateOfBirth
      ? new Date(user.dateOfBirth).toISOString().split('T')[0]
      : '';
    this.editForm.reset({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      dateOfBirth: dob,
      role: user.role,
      password: '',
    });
    this.modalMode.set('edit');
  }

  protected openView(user: User): void {
    this.selectedUser.set(user);
    this.modalMode.set('view');
  }

  protected openDelete(user: User): void {
    this.selectedUser.set(user);
    this.error.set(null);
    this.modalMode.set('delete');
  }

  protected closeModal(): void {
    this.modalMode.set(null);
    this.selectedUser.set(null);
  }

  // CRUD operations
  protected submitAdd(): void {
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
    this.userService.createUser(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('User created successfully.');
        this.loadUsers();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to create user.');
      },
    });
  }

  protected submitEdit(): void {
    this.error.set(null);
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const user = this.selectedUser();
    if (!user) return;
    this.submitting.set(true);
    const v = this.editForm.getRawValue();
    const payload: UpdateUserPayload = {
      fullName: v.fullName,
      email: v.email,
      phone: v.phone,
      gender: v.gender,
      dateOfBirth: v.dateOfBirth || undefined,
      role: v.role,
    };
    if (v.password) payload.password = v.password;

    this.userService.updateUser(user._id, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('User updated successfully.');
        this.loadUsers();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to update user.');
      },
    });
  }

  protected confirmDelete(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.submitting.set(true);
    this.userService.deleteUser(user._id).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('User deleted successfully.');
        this.loadUsers();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to delete user.');
      },
    });
  }

  // Helpers
  protected getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  protected getRoleBadgeClass(role: string): string {
    return `badge badge-${role}`;
  }

  protected isAddInvalid(field: string): boolean {
    const c = this.addForm.get(field);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  protected isEditInvalid(field: string): boolean {
    const c = this.editForm.get(field);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  protected get addPasswordMismatch(): boolean {
    return !!(
      this.addForm.errors?.['passwordMismatch'] &&
      (this.addForm.get('confirmPassword')?.touched ||
        this.addForm.get('confirmPassword')?.dirty)
    );
  }
}

