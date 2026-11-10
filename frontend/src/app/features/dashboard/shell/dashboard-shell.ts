import { ChangeDetectionStrategy, Component, inject, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-dashboard-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './dashboard-shell.html',
  styleUrl: './dashboard-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardShell {
  protected readonly authService = inject(AuthService);
  protected readonly currentUser = this.authService.currentUser;
  protected readonly userRole = this.authService.userRole;

  protected readonly userInitials = computed(() => {
    const name = this.currentUser()?.fullName ?? '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  });

  protected logout(): void {
    this.authService.logout('/login');
  }
}

