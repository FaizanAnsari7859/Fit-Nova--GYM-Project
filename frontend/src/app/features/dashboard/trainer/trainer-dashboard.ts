import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { TrainerOverview, UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-trainer-dashboard',
  imports: [DatePipe],
  templateUrl: './trainer-dashboard.html',
  styleUrl: './trainer-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainerDashboard implements OnInit {
  private readonly userService = inject(UserService);

  protected readonly loading = signal(true);
  protected readonly overview = signal<TrainerOverview | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadOverview();
  }

  private loadOverview(): void {
    this.loading.set(true);
    this.error.set(null);
    this.userService.getTrainerOverview().subscribe({
      next: (data) => {
        this.overview.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          err?.error?.message ?? 'Failed to load trainer overview.',
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
}

