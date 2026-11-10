import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Navbar {
  private readonly authService = inject(AuthService);

  protected readonly menuOpen = signal(false);
  protected readonly isLoggedIn = this.authService.isLoggedIn;
  protected readonly currentUser = this.authService.currentUser;

  protected readonly dashboardLink = computed(() => {
    const role = this.currentUser()?.role;
    if (role === 'admin') return '/dashboard/admin';
    if (role === 'trainer') return '/dashboard/trainer';
    return '/dashboard/member';
  });

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected logout(): void {
    this.closeMenu();
    this.authService.logout('/login');
  }
}
