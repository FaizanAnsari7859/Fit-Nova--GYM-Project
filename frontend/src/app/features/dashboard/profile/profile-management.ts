import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { AuthService } from '../../../core/services/auth.service';

const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const np = control.get('newPassword')?.value as string;
  const cp = control.get('confirmPassword')?.value as string;
  if (np && cp && np !== cp) {
    return { passwordMismatch: true };
  }
  return null;
};

@Component({
  selector: 'app-profile-management',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './profile-management.html',
  styleUrl: './profile-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileManagement implements OnInit {
  protected readonly authService = inject(AuthService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly savingProfile = signal(false);
  protected readonly changingPassword = signal(false);

  protected readonly profileSuccess = signal<string | null>(null);
  protected readonly profileError = signal<string | null>(null);

  protected readonly passwordSuccess = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly userInitials = computed(() => {
    const name = this.currentUser()?.fullName ?? '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  });

  // Profile Form
  protected readonly profileForm = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(80),
      ],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\d{10,15}$/),
      ],
    }),
    gender: new FormControl<'male' | 'female' | 'other'>('male', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    dateOfBirth: new FormControl('', { nonNullable: true }),
  });

  // Password Form
  protected readonly passwordForm = new FormGroup(
    {
      currentPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      newPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordMatchValidator },
  );

  ngOnInit(): void {
    const u = this.currentUser();
    if (u) {
      const dob = u.dateOfBirth
        ? new Date(u.dateOfBirth).toISOString().split('T')[0]
        : '';
      this.profileForm.patchValue({
        fullName: u.fullName,
        phone: u.phone,
        gender: u.gender,
        dateOfBirth: dob,
      });
    }
  }

  protected submitProfile(): void {
    this.profileError.set(null);
    this.profileSuccess.set(null);

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);
    const val = this.profileForm.getRawValue();

    this.authService
      .updateProfile({
        fullName: val.fullName,
        phone: val.phone,
        gender: val.gender,
        dateOfBirth: val.dateOfBirth || undefined,
      })
      .subscribe({
        next: () => {
          this.savingProfile.set(false);
          this.profileSuccess.set('Profile details updated successfully.');
          setTimeout(() => this.profileSuccess.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.savingProfile.set(false);
          this.profileError.set(
            err?.error?.message ?? 'Failed to update profile.',
          );
        },
      });
  }

  protected submitPassword(): void {
    this.passwordError.set(null);
    this.passwordSuccess.set(null);

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.changingPassword.set(true);
    const val = this.passwordForm.getRawValue();

    this.authService
      .updateProfile({
        currentPassword: val.currentPassword,
        newPassword: val.newPassword,
      })
      .subscribe({
        next: () => {
          this.changingPassword.set(false);
          this.passwordSuccess.set('Password updated successfully.');
          this.passwordForm.reset();
          setTimeout(() => this.passwordSuccess.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.changingPassword.set(false);
          this.passwordError.set(
            err?.error?.message ?? 'Failed to change password.',
          );
        },
      });
  }

  protected isProfileInvalid(controlName: string): boolean {
    const c = this.profileForm.get(controlName);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  protected isPasswordInvalid(controlName: string): boolean {
    const c = this.passwordForm.get(controlName);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  protected get passwordMismatch(): boolean {
    return !!(
      this.passwordForm.errors?.['passwordMismatch'] &&
      (this.passwordForm.get('confirmPassword')?.touched ||
        this.passwordForm.get('confirmPassword')?.dirty)
    );
  }
}

