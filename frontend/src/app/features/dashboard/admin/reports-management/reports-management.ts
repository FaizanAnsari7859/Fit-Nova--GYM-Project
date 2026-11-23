import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ReportData,
  ReportFilterParams,
  ReportService,
} from '../../../../core/services/report.service';

type ReportTab = 'all' | 'membership' | 'payments' | 'attendance' | 'registrations';
type DatePreset = 'all' | 'today' | '7days' | '30days' | 'this_month' | 'custom';

@Component({
  selector: 'app-reports-management',
  imports: [CommonModule, CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './reports-management.html',
  styleUrl: './reports-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsManagement implements OnInit {
  private readonly reportService = inject(ReportService);

  // State signals
  protected readonly loading = signal(true);
  protected readonly report = signal<ReportData | null>(null);
  protected readonly error = signal<string | null>(null);

  // Active Tab
  protected readonly activeTab = signal<ReportTab>('all');

  // Filters
  protected readonly selectedPreset = signal<DatePreset>('all');
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');
  protected readonly statusFilter = signal('all');

  ngOnInit(): void {
    this.loadReports();
  }

  protected loadReports(): void {
    this.loading.set(true);
    this.error.set(null);

    const params: ReportFilterParams = {
      type: this.activeTab(),
    };

    if (this.startDate()) {
      params.startDate = this.startDate();
    }
    if (this.endDate()) {
      params.endDate = this.endDate();
    }
    if (this.statusFilter() && this.statusFilter() !== 'all') {
      params.status = this.statusFilter();
    }

    this.reportService.getReports(params).subscribe({
      next: (data) => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          err?.error?.message ?? 'Failed to load report analytics.',
        );
        this.loading.set(false);
      },
    });
  }

  protected setTab(tab: ReportTab): void {
    this.activeTab.set(tab);
    this.statusFilter.set('all');
    this.loadReports();
  }

  protected onPresetChange(preset: DatePreset): void {
    this.selectedPreset.set(preset);
    const now = new Date();

    if (preset === 'all') {
      this.startDate.set('');
      this.endDate.set('');
    } else if (preset === 'today') {
      const today = now.toISOString().split('T')[0];
      this.startDate.set(today);
      this.endDate.set(today);
    } else if (preset === '7days') {
      const past = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
      const today = now.toISOString().split('T')[0];
      this.startDate.set(past);
      this.endDate.set(today);
    } else if (preset === '30days') {
      const past = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
      const today = now.toISOString().split('T')[0];
      this.startDate.set(past);
      this.endDate.set(today);
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const today = now.toISOString().split('T')[0];
      this.startDate.set(firstDay);
      this.endDate.set(today);
    }

    if (preset !== 'custom') {
      this.loadReports();
    }
  }

  protected onDateChange(): void {
    this.selectedPreset.set('custom');
    this.loadReports();
  }

  protected onStatusChange(status: string): void {
    this.statusFilter.set(status);
    this.loadReports();
  }

  protected printReport(): void {
    window.print();
  }

  // Helpers
  protected getPaymentBadge(status: string): string {
    const s = status?.toLowerCase();
    if (s === 'paid') return 'badge badge-paid';
    if (s === 'pending') return 'badge badge-pending';
    return 'badge badge-failed';
  }

  protected getAttendanceBadge(status: string): string {
    const s = status?.toLowerCase();
    if (s === 'present') return 'badge badge-paid';
    if (s === 'late') return 'badge badge-pending';
    return 'badge badge-failed';
  }

  protected getMembershipBadge(status: string): string {
    const s = status?.toLowerCase();
    if (s === 'active') return 'badge badge-paid';
    return 'badge badge-failed';
  }

  protected getInitials(name?: string): string {
    return (name || 'U')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
