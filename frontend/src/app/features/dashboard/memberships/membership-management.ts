import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AssignPlanPayload,
  CreatePlanPayload,
  MembershipPlan,
  MembershipService,
  UpdatePlanPayload,
} from '../../../core/services/membership.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';

type ModalMode = 'add' | 'edit' | 'view' | 'delete' | 'assign' | null;

@Component({
  selector: 'app-membership-management',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe],
  templateUrl: './membership-management.html',
  styleUrl: './membership-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembershipManagement implements OnInit {
  private readonly membershipService = inject(MembershipService);
  private readonly userService = inject(UserService);
  protected readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly plans = signal<MembershipPlan[]>([]);
  protected readonly members = signal<User[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly modalMode = signal<ModalMode>(null);
  protected readonly selectedPlan = signal<MembershipPlan | null>(null);
  protected readonly statusFilter = signal<string>('');

  protected readonly userRole = this.authService.userRole;

  // Plan Form (Create/Edit)
  protected readonly planForm = new FormGroup({
    planName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    duration: new FormControl<number>(30, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    price: new FormControl<number>(49, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    featuresText: new FormControl('', { nonNullable: true }),
    status: new FormControl<'active' | 'inactive'>('active', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  // Assign Plan Form
  protected readonly assignForm = new FormGroup({
    memberId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    amount: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    paymentStatus: new FormControl<'paid' | 'pending'>('paid', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  ngOnInit(): void {
    this.loadPlans();
    if (this.userRole() === 'admin') {
      this.loadMembers();
    }
  }

  protected loadPlans(): void {
    this.loading.set(true);
    this.error.set(null);
    this.membershipService.getPlans(this.statusFilter() || undefined).subscribe({
      next: (data) => {
        this.plans.set(data);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to load membership plans.');
        this.loading.set(false);
      },
    });
  }

  protected loadMembers(): void {
    this.userService.getUsers({ role: 'member' }).subscribe({
      next: (data) => this.members.set(data),
      error: () => {},
    });
  }

  protected onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
    this.loadPlans();
  }

  // Modals
  protected openAdd(): void {
    this.planForm.reset({
      planName: '',
      description: '',
      duration: 30,
      price: 49,
      featuresText: 'Locker access, Group classes, Cardio zone',
      status: 'active',
    });
    this.error.set(null);
    this.success.set(null);
    this.modalMode.set('add');
  }

  protected openEdit(plan: MembershipPlan): void {
    this.selectedPlan.set(plan);
    this.error.set(null);
    this.success.set(null);
    this.planForm.reset({
      planName: plan.planName,
      description: plan.description || '',
      duration: plan.duration,
      price: plan.price,
      featuresText: plan.features.join(', '),
      status: plan.status,
    });
    this.modalMode.set('edit');
  }

  protected openView(plan: MembershipPlan): void {
    this.selectedPlan.set(plan);
    this.modalMode.set('view');
  }

  protected openDelete(plan: MembershipPlan): void {
    this.selectedPlan.set(plan);
    this.error.set(null);
    this.modalMode.set('delete');
  }

  protected openAssign(plan: MembershipPlan): void {
    this.selectedPlan.set(plan);
    this.error.set(null);
    this.success.set(null);
    this.assignForm.reset({
      memberId: '',
      amount: plan.price,
      paymentStatus: 'paid',
    });
    this.modalMode.set('assign');
  }

  protected closeModal(): void {
    this.modalMode.set(null);
    this.selectedPlan.set(null);
  }

  // Submit methods
  protected submitPlan(): void {
    this.error.set(null);
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched();
      return;
    }

    const val = this.planForm.getRawValue();
    const features = val.featuresText
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    this.submitting.set(true);

    if (this.modalMode() === 'add') {
      const payload: CreatePlanPayload = {
        planName: val.planName,
        description: val.description,
        duration: Number(val.duration),
        price: Number(val.price),
        features,
        status: val.status,
      };

      this.membershipService.createPlan(payload).subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeModal();
          this.success.set('Membership plan created successfully.');
          this.loadPlans();
          setTimeout(() => this.success.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(err?.error?.message ?? 'Failed to create membership plan.');
        },
      });
    } else if (this.modalMode() === 'edit' && this.selectedPlan()) {
      const payload: UpdatePlanPayload = {
        planName: val.planName,
        description: val.description,
        duration: Number(val.duration),
        price: Number(val.price),
        features,
        status: val.status,
      };

      this.membershipService.updatePlan(this.selectedPlan()!._id, payload).subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeModal();
          this.success.set('Membership plan updated successfully.');
          this.loadPlans();
          setTimeout(() => this.success.set(null), 4000);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(err?.error?.message ?? 'Failed to update membership plan.');
        },
      });
    }
  }

  protected confirmDelete(): void {
    const plan = this.selectedPlan();
    if (!plan) return;

    this.submitting.set(true);
    this.membershipService.deletePlan(plan._id).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('Membership plan deleted successfully.');
        this.loadPlans();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to delete membership plan.');
      },
    });
  }

  protected submitAssign(): void {
    this.error.set(null);
    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const plan = this.selectedPlan();
    if (!plan) return;

    this.submitting.set(true);
    const val = this.assignForm.getRawValue();
    const payload: AssignPlanPayload = {
      memberId: val.memberId,
      amount: Number(val.amount),
      paymentStatus: val.paymentStatus,
    };

    this.membershipService.assignPlan(plan._id, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set(`Plan "${plan.planName}" assigned to member successfully.`);
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to assign membership plan.');
      },
    });
  }

  protected isInvalid(controlName: string): boolean {
    const c = this.planForm.get(controlName);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }
}

