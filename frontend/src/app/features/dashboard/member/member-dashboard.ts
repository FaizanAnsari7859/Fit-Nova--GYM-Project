import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { MemberOverview, UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-member-dashboard',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './member-dashboard.html',
  styleUrl: './member-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberDashboard implements OnInit {
  private readonly userService = inject(UserService);
  protected readonly authService = inject(AuthService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly loading = signal(true);
  protected readonly overview = signal<MemberOverview | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadOverview();
  }

  private loadOverview(): void {
    this.loading.set(true);
    this.error.set(null);
    this.userService.getMemberOverview().subscribe({
      next: (data) => {
        this.overview.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          err?.error?.message ?? 'Failed to load member dashboard.',
        );
        this.loading.set(false);
      },
    });
  }

  protected getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  protected getStatusBadgeClass(status: string): string {
    const s = status?.toLowerCase();
    if (s === 'active' || s === 'completed' || s === 'paid') return 'badge badge-paid';
    if (s === 'pending') return 'badge badge-pending';
    return 'badge badge-failed';
  }
}

