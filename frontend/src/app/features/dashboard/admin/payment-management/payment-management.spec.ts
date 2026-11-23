import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaymentManagement } from './payment-management';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { PaymentService, Payment } from '../../../../core/services/payment.service';
import { UserService } from '../../../../core/services/user.service';
import { MembershipService } from '../../../../core/services/membership.service';
import { signal } from '@angular/core';

describe('PaymentManagement Component', () => {
  let component: PaymentManagement;
  let fixture: ComponentFixture<PaymentManagement>;

  const mockUserRole = signal<'admin' | 'trainer' | 'member'>('admin');
  const mockAuthService = {
    userRole: mockUserRole,
  };

  const mockPayments: Payment[] = [
    {
      _id: 'p1',
      member: { _id: 'u1', fullName: 'Alice Johnson', email: 'alice@test.com' },
      membership: { _id: 'm1', planName: 'Monthly Gold', price: 2000 },
      amount: 2000,
      paymentStatus: 'paid',
      transactionReference: 'TXN-001',
      paymentDate: '2026-05-01T00:00:00.000Z',
      receiptUrl: 'https://fitnova.test/r1.pdf',
    },
    {
      _id: 'p2',
      member: { _id: 'u2', fullName: 'Bob Smith', email: 'bob@test.com' },
      membership: { _id: 'm2', planName: 'Annual Pro', price: 15000 },
      amount: 15000,
      paymentStatus: 'pending',
      transactionReference: 'TXN-002',
      paymentDate: '2026-05-02T00:00:00.000Z',
    },
  ];

  const mockPaymentService = {
    listPayments: vi.fn().mockReturnValue(
      of({
        success: true,
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        count: 2,
        data: mockPayments,
      })
    ),
    createPayment: vi.fn(),
    updatePayment: vi.fn(),
    deletePayment: vi.fn(),
    getReceipt: vi.fn().mockReturnValue(
      of({
        receiptUrl: 'https://fitnova.test/r1.pdf',
        transactionReference: 'TXN-001',
        amount: 2000,
        paymentDate: '2026-05-01T00:00:00.000Z',
        paymentStatus: 'paid',
        member: { fullName: 'Alice Johnson', email: 'alice@test.com' },
        membership: { planName: 'Monthly Gold', price: 2000, duration: 30 },
      })
    ),
  };

  const mockUserService = {
    getUsers: vi.fn().mockReturnValue(of([])),
  };

  const mockMembershipService = {
    getPlans: vi.fn().mockReturnValue(of([])),
  };

  beforeEach(async () => {
    mockUserRole.set('admin');

    await TestBed.configureTestingModule({
      imports: [PaymentManagement],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: UserService, useValue: mockUserService },
        { provide: MembershipService, useValue: mockMembershipService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load payments on init', () => {
    expect(mockPaymentService.listPayments).toHaveBeenCalled();
  });

  describe('Role-based permissions', () => {
    it('admin should have full create, edit status, and delete permissions', () => {
      mockUserRole.set('admin');
      expect((component as any).canCreate()).toBe(true);
      expect((component as any).canEditStatus()).toBe(true);
      expect((component as any).canDelete()).toBe(true);
    });

    it('trainer should only be able to edit status, not create or delete', () => {
      mockUserRole.set('trainer');
      expect((component as any).canCreate()).toBe(false);
      expect((component as any).canEditStatus()).toBe(true);
      expect((component as any).canDelete()).toBe(false);
    });

    it('member should have read-only view', () => {
      mockUserRole.set('member');
      expect((component as any).canCreate()).toBe(false);
      expect((component as any).canEditStatus()).toBe(false);
      expect((component as any).canDelete()).toBe(false);
    });
  });

  describe('Formatting helpers', () => {
    it('should format member name safely', () => {
      expect((component as any).getMemberName(mockPayments[0].member)).toBe('Alice Johnson');
      expect((component as any).getMemberName('raw_id')).toBe('Member');
    });

    it('should format membership plan name safely', () => {
      expect((component as any).getMembershipPlanName(mockPayments[0].membership)).toBe('Monthly Gold');
      expect((component as any).getMembershipPlanName('raw_id')).toBe('Plan');
    });

    it('should return correct badge classes', () => {
      expect((component as any).getStatusBadgeClass('paid')).toBe('badge badge-success');
      expect((component as any).getStatusBadgeClass('pending')).toBe('badge badge-warning');
      expect((component as any).getStatusBadgeClass('failed')).toBe('badge badge-danger');
    });
  });

  describe('Modal interactions', () => {
    it('openAddModal should set modalMode to add and reset form', () => {
      (component as any).openAddModal();
      expect((component as any).modalMode()).toBe('add');
    });

    it('openStatusModal should set selected payment and modalMode to status', () => {
      (component as any).openStatusModal(mockPayments[0]);
      expect((component as any).selectedPayment()).toEqual(mockPayments[0]);
      expect((component as any).modalMode()).toBe('status');
    });

    it('closeModal should clear modalMode and selection', () => {
      (component as any).openAddModal();
      (component as any).closeModal();
      expect((component as any).modalMode()).toBeNull();
      expect((component as any).selectedPayment()).toBeNull();
    });

    it('openReceiptModal should fetch and display receipt for paid payments', () => {
      (component as any).openReceiptModal(mockPayments[0]);
      expect((component as any).modalMode()).toBe('receipt');
      expect((component as any).selectedPayment()).toEqual(mockPayments[0]);
      expect(mockPaymentService.getReceipt).toHaveBeenCalledWith('p1');
      expect((component as any).receiptNotFound()).toBe(false);
      expect((component as any).receiptData()?.transactionReference).toBe('TXN-001');
      expect((component as any).receiptData()?.member?.fullName).toBe('Alice Johnson');
    });

    it('openReceiptModal should not generate receipt for unpaid or pending payments', () => {
      (component as any).openReceiptModal(mockPayments[1]);
      expect((component as any).modalMode()).toBe('receipt');
      expect((component as any).selectedPayment()).toEqual(mockPayments[1]);
      expect((component as any).receiptNotFound()).toBe(true);
      expect((component as any).receiptData()).toBeNull();
      expect((component as any).receiptErrorReason()).toContain('pending');
    });

    it('printReceipt should call window.print', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
      (component as any).printReceipt();
      expect(printSpy).toHaveBeenCalled();
      printSpy.mockRestore();
    });

    it('downloadReceipt should trigger file download for receipt', () => {
      (component as any).openReceiptModal(mockPayments[0]);
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      (component as any).downloadReceipt();

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalled();

      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
      clickSpy.mockRestore();
    });
  });
});

