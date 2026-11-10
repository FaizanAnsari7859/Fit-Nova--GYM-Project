import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected isInvalid(controlName: 'email' | 'password'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  protected submit(): void {
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email, password } = this.form.getRawValue();

    this.authService.login({ email, password }).subscribe({
      next: (response) => {
        this.loading.set(false);
        const returnUrl = this.route.snapshot.queryParams['returnUrl'];
        if (returnUrl && returnUrl !== '/') {
          this.router.navigateByUrl(returnUrl);
          return;
        }
        const role = response.data?.role;
        if (role === 'admin') {
          this.router.navigateByUrl('/dashboard/admin');
        } else if (role === 'trainer') {
          this.router.navigateByUrl('/dashboard/trainer');
        } else {
          this.router.navigateByUrl('/dashboard/member');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const message =
          err.error?.message ||
          (err.status === 0
            ? 'Cannot connect to backend server. Please make sure the API is running on port 5000.'
            : 'Login failed. Please verify your credentials.');
        this.errorMessage.set(message);
      },
    });
  }
}
