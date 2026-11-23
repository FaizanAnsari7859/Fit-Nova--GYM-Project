import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../../core/services/auth.service';
import {
  AttendanceFilter,
  AttendanceMember,
  AttendanceRecord,
  AttendanceService,
} from '../../../../core/services/attendance.service';
import { UserService } from '../../../../core/services/user.service';
import { User } from '../../../../core/models/auth.models';

type ModalMode = 'checkin' | 'checkout' | 'delete' | null;

@Component({
  selector: 'app-attendance-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './attendance-management.html',
  styleUrl: './attendance-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceManagement implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly userService = inject(UserService);

  // User role & current user
  protected readonly userRole = this.authService.userRole;
  protected readonly currentUser = this.authService.currentUser;

  // State signals
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly records = signal<AttendanceRecord[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly currentPage = signal(1);
  protected readonly pageSize = 10;

  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  // Modal state
  protected readonly modalMode = signal<ModalMode>(null);
  protected readonly selectedRecord = signal<AttendanceRecord | null>(null);

  // Lookups
  protected readonly membersList = signal<User[]>([]);

  // Filter signals
  protected readonly memberFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly dateFilter = signal('');
  protected readonly startDateFilter = signal('');
  protected readonly endDateFilter = signal('');

  // Forms
  protected readonly checkInForm = new FormGroup({
    member: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    checkInTime: new FormControl(this.getCurrentLocalDatetime(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    status: new FormControl<'present' | 'absent' | 'late'>('present', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected readonly checkOutForm = new FormGroup({
    checkOutTime: new FormControl(this.getCurrentLocalDatetime(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  private getCurrentLocalDatetime(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const local = new Date(now.getTime() - offset);
    return local.toISOString().slice(0, 16);
  }

  ngOnInit(): void {
    this.loadLookups();
    this.loadAttendance();
  }

  // Load members for admin & trainer dropdowns
  private loadLookups(): void {
    const role = this.userRole();
    if (role === 'admin' || role === 'trainer') {
      this.userService.getUsers({ role: 'member' }).subscribe({
        next: (data) => {
          if (role === 'trainer') {
            const trainerId = this.currentUser()?._id;
            // Filter to assigned members
            const assigned = data.filter(
              (m) =>
                m.assignedTrainer === trainerId ||
                (typeof m.assignedTrainer === 'object' &&
                  (m.assignedTrainer as any)?._id === trainerId),
            );
            this.membersList.set(assigned);
          } else {
            this.membersList.set(data);
          }
        },
        error: () => {},
      });
    }
  }

  // Load attendance records
  protected loadAttendance(page: number = this.currentPage()): void {
    this.loading.set(true);
    this.error.set(null);

    const filter: AttendanceFilter = {
      page,
      limit: this.pageSize,
    };

    if (this.memberFilter()) {
      filter.member = this.memberFilter();
    }
    if (this.statusFilter()) {
      filter.status = this.statusFilter();
    }
    if (this.dateFilter()) {
      filter.date = this.dateFilter();
    }
    if (this.startDateFilter()) {
      filter.startDate = this.startDateFilter();
    }
    if (this.endDateFilter()) {
      filter.endDate = this.endDateFilter();
    }

    this.attendanceService.listAttendance(filter).subscribe({
      next: (res) => {
        this.records.set(res.data);
        this.totalCount.set(res.total);
        this.totalPages.set(res.totalPages || 1);
        this.currentPage.set(res.page || 1);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to load attendance.');
        this.loading.set(false);
      },
    });
  }

  // Filter Handlers
  protected onMemberFilterChange(event: Event): void {
    this.memberFilter.set((event.target as HTMLSelectElement).value);
    this.loadAttendance(1);
  }

  protected onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
    this.loadAttendance(1);
  }

  protected onDateFilterChange(event: Event): void {
    this.dateFilter.set((event.target as HTMLInputElement).value);
    this.loadAttendance(1);
  }

  protected onStartDateChange(event: Event): void {
    this.startDateFilter.set((event.target as HTMLInputElement).value);
    this.loadAttendance(1);
  }

  protected onEndDateChange(event: Event): void {
    this.endDateFilter.set((event.target as HTMLInputElement).value);
    this.loadAttendance(1);
  }

  protected resetFilters(): void {
    this.memberFilter.set('');
    this.statusFilter.set('');
    this.dateFilter.set('');
    this.startDateFilter.set('');
    this.endDateFilter.set('');
    this.loadAttendance(1);
  }

  // Pagination Handlers
  protected previousPage(): void {
    if (this.currentPage() > 1) {
      this.loadAttendance(this.currentPage() - 1);
    }
  }

  protected nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.loadAttendance(this.currentPage() + 1);
    }
  }

  // Modal Handlers
  protected openCheckInModal(): void {
    this.checkInForm.reset({
      member: '',
      checkInTime: this.getCurrentLocalDatetime(),
      status: 'present',
    });
    this.error.set(null);
    this.modalMode.set('checkin');
  }

  protected openCheckOutModal(record: AttendanceRecord): void {
    this.selectedRecord.set(record);
    this.checkOutForm.reset({
      checkOutTime: this.getCurrentLocalDatetime(),
    });
    this.error.set(null);
    this.modalMode.set('checkout');
  }

  protected openDeleteModal(record: AttendanceRecord): void {
    this.selectedRecord.set(record);
    this.error.set(null);
    this.modalMode.set('delete');
  }

  protected closeModal(): void {
    this.modalMode.set(null);
    this.selectedRecord.set(null);
    this.submitting.set(false);
  }

  // Submit Check-In
  protected submitCheckIn(): void {
    if (this.checkInForm.invalid) {
      this.checkInForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const val = this.checkInForm.getRawValue();

    this.attendanceService
      .checkIn({
        member: val.member,
        checkInTime: new Date(val.checkInTime).toISOString(),
        attendanceDate: new Date(val.checkInTime).toISOString(),
        status: val.status,
      })
      .subscribe({
        next: () => {
          this.success.set('Check-in recorded successfully.');
          this.submitting.set(false);
          this.closeModal();
          this.loadAttendance(1);
          setTimeout(() => this.success.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(err?.error?.message ?? 'Failed to record check-in.');
          this.submitting.set(false);
        },
      });
  }

  // Submit Check-Out
  protected submitCheckOut(): void {
    const record = this.selectedRecord();
    if (!record) return;

    this.submitting.set(true);
    const val = this.checkOutForm.getRawValue();

    this.attendanceService
      .checkOut(record._id, {
        checkOutTime: new Date(val.checkOutTime).toISOString(),
      })
      .subscribe({
        next: () => {
          this.success.set('Check-out recorded successfully.');
          this.submitting.set(false);
          this.closeModal();
          this.loadAttendance();
          setTimeout(() => this.success.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(err?.error?.message ?? 'Failed to record check-out.');
          this.submitting.set(false);
        },
      });
  }

  // Submit Delete
  protected submitDelete(): void {
    const record = this.selectedRecord();
    if (!record) return;

    this.submitting.set(true);
    this.attendanceService.deleteAttendance(record._id).subscribe({
      next: () => {
        this.success.set('Attendance record deleted.');
        this.submitting.set(false);
        this.closeModal();
        this.loadAttendance();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to delete attendance record.');
        this.submitting.set(false);
      },
    });
  }

  // Helper formatting methods
  protected getMemberName(member: AttendanceMember | string): string {
    if (typeof member === 'object' && member !== null) {
      return member.fullName || 'Member';
    }
    return 'Member';
  }

  protected getMemberEmail(member: AttendanceMember | string): string {
    if (typeof member === 'object' && member !== null) {
      return member.email || '';
    }
    return '';
  }

  protected getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'present':
        return 'badge badge-success';
      case 'late':
        return 'badge badge-warning';
      case 'absent':
        return 'badge badge-danger';
      default:
        return 'badge';
    }
  }

  protected canRecord(): boolean {
    return this.userRole() === 'admin' || this.userRole() === 'trainer';
  }

  protected canDelete(): boolean {
    return this.userRole() === 'admin';
  }
}

