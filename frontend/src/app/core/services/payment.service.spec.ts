import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PaymentService, Payment } from './payment.service';
import { environment } from '../../../environments/environment';

describe('PaymentService', () => {
  let service: PaymentService;
  let httpMock: HttpTestingController;
  const apiUrl = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PaymentService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(PaymentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list payments with query filters', () => {
    const mockResponse = {
      success: true,
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      count: 1,
      data: [
        {
          _id: 'pay123',
          member: 'mem1',
          membership: 'plan1',
          amount: 1500,
          paymentStatus: 'paid' as const,
          transactionReference: 'TXN-123',
          paymentDate: '2026-05-10T00:00:00.000Z',
        },
      ],
    };

    service.listPayments({ status: 'paid', page: 1, limit: 10 }).subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.data[0].amount).toBe(1500);
      expect(res.data[0].paymentStatus).toBe('paid');
    });

    const req = httpMock.expectOne((r) => r.url === `${apiUrl}/payments` && r.params.get('status') === 'paid');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should create payment', () => {
    const payload = {
      member: 'mem1',
      membership: 'plan1',
      amount: 2500,
      paymentStatus: 'paid' as const,
      transactionReference: 'TXN-999',
      paymentDate: '2026-05-10T00:00:00.000Z',
    };

    const mockCreated: Payment = {
      _id: 'new_id',
      ...payload,
    };

    service.createPayment(payload).subscribe((res) => {
      expect(res._id).toBe('new_id');
      expect(res.amount).toBe(2500);
    });

    const req = httpMock.expectOne(`${apiUrl}/payments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, data: mockCreated });
  });

  it('should update payment status', () => {
    service.updatePayment('pay123', { paymentStatus: 'failed' }).subscribe((res) => {
      expect(res.paymentStatus).toBe('failed');
    });

    const req = httpMock.expectOne(`${apiUrl}/payments/pay123`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ paymentStatus: 'failed' });
    req.flush({ success: true, data: { _id: 'pay123', paymentStatus: 'failed' } });
  });

  it('should fetch receipt details', () => {
    service.getReceipt('pay123').subscribe((res) => {
      expect(res.receiptUrl).toBe('https://fitnova.test/rec.pdf');
      expect(res.transactionReference).toBe('TXN-123');
      expect(res.amount).toBe(2500);
      expect(res.paymentStatus).toBe('paid');
      expect(res.member?.fullName).toBe('Test Member');
      expect(res.membership?.planName).toBe('Gold Plan');
    });

    const req = httpMock.expectOne(`${apiUrl}/payments/pay123/receipt`);
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: {
        receiptUrl: 'https://fitnova.test/rec.pdf',
        transactionReference: 'TXN-123',
        amount: 2500,
        paymentDate: '2026-05-10T00:00:00.000Z',
        paymentStatus: 'paid',
        member: { fullName: 'Test Member', email: 'test@member.com' },
        membership: { planName: 'Gold Plan', price: 2500 },
      },
    });
  });

  it('should delete payment', () => {
    service.deletePayment('pay123').subscribe((res) => {
      expect(res).toBeUndefined();
    });

    const req = httpMock.expectOne(`${apiUrl}/payments/pay123`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Payment deleted.' });
  });
});

