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
  Payment,
  PaymentFilter,
  PaymentMember,
  PaymentMembership,
  PaymentService,
  ReceiptData,
} from '../../../../core/services/payment.service';
import { UserService } from '../../../../core/services/user.service';
import {
  MembershipPlan,
  MembershipService,
} from '../../../../core/services/membership.service';
import { User } from '../../../../core/models/auth.models';

type ModalMode = 'add' | 'status' | 'receipt' | 'delete' | null;

@Component({
  selector: 'app-payment-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './payment-management.html',
  styleUrl: './payment-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentManagement implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly paymentService = inject(PaymentService);
  private readonly userService = inject(UserService);
  private readonly membershipService = inject(MembershipService);

  // User role
  protected readonly userRole = this.authService.userRole;

  // State signals
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly currentPage = signal(1);
  protected readonly pageSize = 10;

  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  // Modal State
  protected readonly modalMode = signal<ModalMode>(null);
  protected readonly selectedPayment = signal<Payment | null>(null);
  protected readonly receiptData = signal<ReceiptData | null>(null);
  protected readonly receiptNotFound = signal(false);
  protected readonly receiptErrorReason = signal<string | null>(null);

  // Lookup data for creation / filters
  protected readonly membersList = signal<User[]>([]);
  protected readonly membershipPlans = signal<MembershipPlan[]>([]);

  // Filter signals
  protected readonly memberFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly startDateFilter = signal('');
  protected readonly endDateFilter = signal('');

  // Add Payment Form (Admin only)
  protected readonly addForm = new FormGroup({
    member: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    membership: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    amount: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(0)],
    }),
    paymentStatus: new FormControl<'pending' | 'paid' | 'failed'>('paid', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    paymentDate: new FormControl(
      new Date().toISOString().split('T')[0],
      { nonNullable: true, validators: [Validators.required] },
    ),
    transactionReference: new FormControl('', { nonNullable: true }),
    receiptUrl: new FormControl('', { nonNullable: true }),
  });

  // Quick Status Form (Admin or Trainer)
  protected readonly statusForm = new FormGroup({
    status: new FormControl<'pending' | 'paid' | 'failed'>('paid', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  ngOnInit(): void {
    this.loadLookups();
    this.loadPayments();
  }

  // Load members and plans for selectors
  private loadLookups(): void {
    if (this.userRole() === 'admin') {
      this.userService.getUsers({ role: 'member' }).subscribe({
        next: (data) => this.membersList.set(data),
        error: () => { },
      });
    }

    this.membershipService.getPlans().subscribe({
      next: (plans) => this.membershipPlans.set(plans),
      error: () => { },
    });
  }

  // Auto-fill amount when membership plan is selected in Add Form
  protected onMembershipSelect(event: Event): void {
    const planId = (event.target as HTMLSelectElement).value;
    const plan = this.membershipPlans().find((p) => p._id === planId);
    if (plan) {
      this.addForm.patchValue({ amount: plan.price });
    }
  }

  // Load payments from backend
  protected loadPayments(page: number = this.currentPage()): void {
    this.loading.set(true);
    this.error.set(null);

    const filter: PaymentFilter = {
      page,
      limit: this.pageSize,
    };

    if (this.memberFilter()) {
      filter.member = this.memberFilter();
    }
    if (this.statusFilter()) {
      filter.status = this.statusFilter();
    }
    if (this.startDateFilter()) {
      filter.startDate = this.startDateFilter();
    }
    if (this.endDateFilter()) {
      filter.endDate = this.endDateFilter();
    }

    this.paymentService.listPayments(filter).subscribe({
      next: (res) => {
        this.payments.set(res.data);
        this.totalCount.set(res.total);
        this.totalPages.set(res.totalPages || 1);
        this.currentPage.set(res.page || 1);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to load payments.');
        this.loading.set(false);
      },
    });
  }

  // Filter Handlers
  protected onMemberFilterChange(event: Event): void {
    this.memberFilter.set((event.target as HTMLSelectElement).value);
    this.loadPayments(1);
  }

  protected onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
    this.loadPayments(1);
  }

  protected onStartDateChange(event: Event): void {
    this.startDateFilter.set((event.target as HTMLInputElement).value);
    this.loadPayments(1);
  }

  protected onEndDateChange(event: Event): void {
    this.endDateFilter.set((event.target as HTMLInputElement).value);
    this.loadPayments(1);
  }

  protected resetFilters(): void {
    this.memberFilter.set('');
    this.statusFilter.set('');
    this.startDateFilter.set('');
    this.endDateFilter.set('');
    this.loadPayments(1);
  }

  // Pagination Handlers
  protected previousPage(): void {
    if (this.currentPage() > 1) {
      this.loadPayments(this.currentPage() - 1);
    }
  }

  protected nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.loadPayments(this.currentPage() + 1);
    }
  }

  // Modal Openers
  protected openAddModal(): void {
    this.addForm.reset({
      member: '',
      membership: '',
      amount: null,
      paymentStatus: 'paid',
      paymentDate: new Date().toISOString().split('T')[0],
      transactionReference: `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      receiptUrl: '',
    });
    this.error.set(null);
    this.modalMode.set('add');
  }

  protected openStatusModal(payment: Payment): void {
    this.selectedPayment.set(payment);
    this.statusForm.reset({
      status: payment.paymentStatus,
    });
    this.error.set(null);
    this.modalMode.set('status');
  }

  protected openDeleteModal(payment: Payment): void {
    this.selectedPayment.set(payment);
    this.error.set(null);
    this.modalMode.set('delete');
  }

  protected openReceiptModal(payment: Payment): void {
    this.selectedPayment.set(payment);
    this.receiptData.set(null);
    this.receiptNotFound.set(false);
    this.receiptErrorReason.set(null);
    this.modalMode.set('receipt');

    // Do not generate receipts for failed or unpaid transactions
    if (payment.paymentStatus !== 'paid') {
      this.receiptNotFound.set(true);
      this.receiptErrorReason.set(
        `Receipts are only generated for successful paid transactions. This transaction is currently ${payment.paymentStatus}.`,
      );
      return;
    }

    this.paymentService.getReceipt(payment._id).subscribe({
      next: (data) => {
        this.receiptData.set(data);
      },
      error: () => {
        // Handle old records gracefully by constructing receipt data from payment record
        this.receiptData.set({
          receiptUrl: payment.receiptUrl || `/api/payments/${payment._id}/receipt/download`,
          transactionReference: payment.transactionReference,
          amount: payment.amount,
          paymentDate: payment.paymentDate,
          paymentStatus: payment.paymentStatus,
          member: {
            fullName: this.getMemberName(payment.member),
            email: this.getMemberEmail(payment.member),
          },
          membership: {
            planName: this.getMembershipPlanName(payment.membership),
            price: payment.amount,
          },
        });
      },
    });
  }

  protected printReceipt(): void {
    window.print();
  }

  protected downloadReceipt(): void {
    const payment = this.selectedPayment();
    const receipt = this.receiptData();
    if (!payment && !receipt) return;

    const ref = receipt?.transactionReference || payment?.transactionReference || 'receipt';
    const memberName = receipt?.member?.fullName || (payment ? this.getMemberName(payment.member) : 'Member');
    const memberEmail = receipt?.member?.email || (payment ? this.getMemberEmail(payment.member) : '');
    const planName = receipt?.membership?.planName || (payment ? this.getMembershipPlanName(payment.membership) : 'Membership Plan');
    const amount = receipt?.amount ?? payment?.amount ?? 0;
    const dateStr = new Date(receipt?.paymentDate || payment?.paymentDate || new Date()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Receipt - ${ref}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #111; padding: 30px; }
    .receipt-box { max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ff8533; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { font-size: 24px; font-weight: 800; color: #ff8533; letter-spacing: 1px; }
    .badge { background: #22c55e; color: #fff; padding: 4px 14px; border-radius: 999px; font-weight: 700; font-size: 13px; text-transform: uppercase; }
    .row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
    .label { color: #666; font-weight: 500; }
    .val { font-weight: 600; color: #111; }
    .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .table th { background: #f8f8f8; text-align: left; padding: 10px; font-size: 13px; border-bottom: 2px solid #ddd; text-transform: uppercase; }
    .table td { padding: 14px 10px; border-bottom: 1px solid #eee; font-size: 14px; }
    .total { text-align: right; font-size: 18px; font-weight: 800; margin-top: 16px; color: #ff8533; }
    .footer { margin-top: 24px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="receipt-box">
    <div class="header">
      <div>
        <div class="brand">FITNOVA</div>
        <small style="color: #666;">Official Tax Invoice & Receipt</small>
      </div>
      <span class="badge">✓ PAID</span>
    </div>
    <div class="row"><span class="label">Transaction Reference:</span><span class="val">${ref}</span></div>
    <div class="row"><span class="label">Payment Date:</span><span class="val">${dateStr}</span></div>
    <div class="row"><span class="label">Member:</span><span class="val">${memberName} (${memberEmail})</span></div>
    <table class="table">
      <thead><tr><th>Description</th><th style="text-align: right;">Amount</th></tr></thead>
      <tbody><tr><td><strong>${planName}</strong><br><small style="color: #666;">Gym membership facilities & access</small></td><td style="text-align: right; font-weight: 700;">₹${amount.toLocaleString('en-IN')}</td></tr></tbody>
    </table>
    <div class="total">Total Paid: ₹${amount.toLocaleString('en-IN')}</div>
    <div class="footer">FitNova Fitness Club · 123 Fitness Boulevard · support@fitnova.com<br>Thank you for your business!</div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${ref}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  protected closeModal(): void {
    this.modalMode.set(null);
    this.selectedPayment.set(null);
    this.receiptData.set(null);
    this.receiptNotFound.set(false);
    this.receiptErrorReason.set(null);
    this.submitting.set(false);
  }

  // Create payment submit
  protected submitAdd(): void {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const val = this.addForm.getRawValue();

    this.paymentService
      .createPayment({
        member: val.member,
        membership: val.membership,
        amount: Number(val.amount),
        paymentStatus: val.paymentStatus,
        paymentDate: new Date(val.paymentDate).toISOString(),
        transactionReference: val.transactionReference || undefined,
        receiptUrl: val.receiptUrl || undefined,
      })
      .subscribe({
        next: () => {
          this.success.set('Payment created successfully.');
          this.submitting.set(false);
          this.closeModal();
          this.loadPayments(1);
          setTimeout(() => this.success.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(err?.error?.message ?? 'Failed to create payment.');
          this.submitting.set(false);
        },
      });
  }

  // Update status submit
  protected submitStatus(): void {
    const payment = this.selectedPayment();
    if (!payment) return;

    this.submitting.set(true);
    const newStatus = this.statusForm.getRawValue().status;

    this.paymentService
      .updatePayment(payment._id, { paymentStatus: newStatus })
      .subscribe({
        next: () => {
          this.success.set('Payment status updated.');
          this.submitting.set(false);
          this.closeModal();
          this.loadPayments();
          setTimeout(() => this.success.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(err?.error?.message ?? 'Failed to update payment status.');
          this.submitting.set(false);
        },
      });
  }

  // Delete payment submit (Admin only)
  protected submitDelete(): void {
    const payment = this.selectedPayment();
    if (!payment) return;

    this.submitting.set(true);
    this.paymentService.deletePayment(payment._id).subscribe({
      next: () => {
        this.success.set('Payment record deleted.');
        this.submitting.set(false);
        this.closeModal();
        this.loadPayments();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to delete payment.');
        this.submitting.set(false);
      },
    });
  }

  // Helper formatting methods
  protected getMemberName(member: PaymentMember | string): string {
    if (typeof member === 'object' && member !== null) {
      return member.fullName || 'Member';
    }
    return 'Member';
  }

  protected getMemberEmail(member: PaymentMember | string): string {
    if (typeof member === 'object' && member !== null) {
      return member.email || '';
    }
    return '';
  }

  protected getMembershipPlanName(membership: PaymentMembership | string): string {
    if (typeof membership === 'object' && membership !== null) {
      return membership.planName || 'Plan';
    }
    return 'Plan';
  }

  protected getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'paid':
        return 'badge badge-success';
      case 'pending':
        return 'badge badge-warning';
      case 'failed':
        return 'badge badge-danger';
      default:
        return 'badge';
    }
  }

  protected canCreate(): boolean {
    return this.userRole() === 'admin';
  }

  protected canEditStatus(): boolean {
    return this.userRole() === 'admin' || this.userRole() === 'trainer';
  }

  protected canDelete(): boolean {
    return this.userRole() === 'admin';
  }
}

