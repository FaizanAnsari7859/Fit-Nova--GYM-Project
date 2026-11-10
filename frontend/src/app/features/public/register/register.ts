import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UserGender, UserRole } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

function minimumAgeValidator(minAge: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null;
    }
    const dob = new Date(control.value);
    if (Number.isNaN(dob.getTime()) || dob >= new Date()) {
      return { invalidDate: true };
    }
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - minAge);
    return dob <= cutoff ? null : { underage: true };
  };
}

function phoneValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) {
    return null;
  }
  const digits = String(control.value).replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? null : { invalidPhone: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly form = new FormGroup(
    {
      fullName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      phone: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, phoneValidator],
      }),
      gender: new FormControl<UserGender>('male', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      dateOfBirth: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, minimumAgeValidator(13)],
      }),
      role: new FormControl<'member' | 'trainer'>('member', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8), Validators.maxLength(64)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: [passwordMatchValidator] },
  );

  protected isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  protected get passwordMismatch(): boolean {
    const confirm = this.form.controls.confirmPassword;
    return Boolean(this.form.errors?.['passwordMismatch'] && (confirm.touched || confirm.dirty));
  }

  protected submit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const raw = this.form.getRawValue();

    const payload = {
      ...raw,
      phone: raw.phone.replace(/\D/g, ''),
    };

    this.authService.register(payload).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.successMessage.set('Registration successful! Redirecting to home...');
        setTimeout(() => {
          this.router.navigateByUrl('/');
        }, 1200);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const serverError =
          err.error?.message ||
          (err.error?.errors && err.error.errors[0]) ||
          (err.status === 0
            ? 'Cannot connect to backend server. Please verify the API is running.'
            : 'Registration failed. Please check the details and try again.');
        this.errorMessage.set(serverError);
      },
    });
  }
}
