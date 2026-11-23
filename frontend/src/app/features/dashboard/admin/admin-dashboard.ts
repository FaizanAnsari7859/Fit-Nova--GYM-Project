import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  AdminStats,
  TrainerAssignmentsOverview,
  UserService,
} from '../../../core/services/user.service';

type ActivityTab = 'registrations' | 'payments' | 'attendance';

@Component({
  selector: 'app-admin-dashboard',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard implements OnInit {
  private readonly userService = inject(UserService);

  // Overview stats signals
  protected readonly loading = signal(true);
  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly activeTab = signal<ActivityTab>('registrations');

  // Trainer assignments signals
  protected readonly loadingAssignments = signal(true);
  protected readonly assignments = signal<TrainerAssignmentsOverview | null>(null);
  protected readonly assignmentsError = signal<string | null>(null);
  protected readonly expandedTrainers = signal<Set<string>>(new Set());
  protected readonly unassignedExpanded = signal(false);

  ngOnInit(): void {
    this.loadStats();
    this.loadAssignments();
  }

  protected loadStats(): void {
    this.loading.set(true);
    this.error.set(null);
    this.userService.getAdminStats().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          err?.error?.message ?? 'Failed to load dashboard statistics.',
        );
        this.loading.set(false);
      },
    });
  }

  protected loadAssignments(): void {
    this.loadingAssignments.set(true);
    this.assignmentsError.set(null);
    this.userService.getTrainerAssignmentsOverview().subscribe({
      next: (data) => {
        this.assignments.set(data);
        this.loadingAssignments.set(false);
      },
      error: (err) => {
        this.assignmentsError.set(
          err?.error?.message ?? 'Failed to load trainer assignments overview.',
        );
        this.loadingAssignments.set(false);
      },
    });
  }

  public toggleTrainer(trainerId: string): void {
    const current = new Set(this.expandedTrainers());
    if (current.has(trainerId)) {
      current.delete(trainerId);
    } else {
      current.add(trainerId);
    }
    this.expandedTrainers.set(current);
  }

  public isTrainerExpanded(trainerId: string): boolean {
    return this.expandedTrainers().has(trainerId);
  }

  public toggleUnassigned(): void {
    this.unassignedExpanded.set(!this.unassignedExpanded());
  }

  protected getAssignedMemberNames(trainer: any): string {
    if (!trainer.assignedMembers || trainer.assignedMembers.length === 0) {
      return 'None';
    }
    const names = trainer.assignedMembers.slice(0, 3).map((m: any) => m.fullName);
    const remaining = trainer.assignedMembers.length - 3;
    if (remaining > 0) {
      return `${names.join(', ')} +${remaining} more`;
    }
    return names.join(', ');
  }

  protected setActiveTab(tab: ActivityTab): void {
    this.activeTab.set(tab);
  }

  protected getRoleBadgeClass(role: string): string {
    return `badge badge-${role}`;
  }

  protected getPaymentBadgeClass(status: string): string {
    const s = status?.toLowerCase();
    if (s === 'paid') return 'badge badge-paid';
    if (s === 'pending') return 'badge badge-pending';
    return 'badge badge-failed';
  }

  protected getAttendanceBadgeClass(status: string): string {
    const s = status?.toLowerCase();
    if (s === 'present') return 'badge badge-paid';
    if (s === 'late') return 'badge badge-pending';
    return 'badge badge-failed';
  }

  protected getMembershipBadgeClass(status?: string): string {
    const s = status?.toLowerCase();
    if (s === 'active') return 'badge badge-paid';
    if (s === 'expired') return 'badge badge-failed';
    return 'badge badge-pending';
  }

  protected getInitials(name: string): string {
    return (name || '')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
