import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidatorFn,
  ValidationErrors,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { User } from '../../../core/models/auth.models';
import {
  CreateUserPayload,
  UpdateUserPayload,
  UserService,
} from '../../../core/services/user.service';
import { TrainerService } from '../../../core/services/trainer.service';
import { TrainerAssignmentItem } from '../../../core/services/user.service';

type ModalMode = 'add' | 'edit' | 'view' | 'delete' | null;

const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const pw = control.get('password')?.value as string;
  const cpw = control.get('confirmPassword')?.value as string;
  if (pw && cpw && pw !== cpw) return { passwordMismatch: true };
  return null;
};

@Component({
  selector: 'app-trainer-management',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './trainer-management.html',
  styleUrl: './trainer-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainerManagement implements OnInit {
  private readonly userService = inject(UserService);
  private readonly trainerService = inject(TrainerService);

  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly success = signal<string | null>(null);
  public readonly submitting = signal(false);

  public readonly trainers = signal<User[]>([]);
  public readonly members = signal<User[]>([]);
  public readonly assignmentOverview = signal<TrainerAssignmentItem[]>([]);

  public readonly modalMode = signal<ModalMode>(null);
  public readonly selectedTrainer = signal<User | null>(null);

  // Filters
  public readonly searchValue = signal('');

  // Add Trainer form
  public readonly addForm = new FormGroup(
    {
      fullName: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(80),
        ],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      phone: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.pattern(/^\d{10,15}$/),
        ],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      gender: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      dateOfBirth: new FormControl('', { nonNullable: true }),
      specialization: new FormControl('', { nonNullable: true }),
      experienceYears: new FormControl<number | ''>('', { nonNullable: true }),
      bio: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(500)],
      }),
    },
    { validators: passwordMatchValidator },
  );

  // Edit Trainer form
  public readonly editForm = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(80),
      ],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\d{10,15}$/),
      ],
    }),
    gender: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    dateOfBirth: new FormControl('', { nonNullable: true }),
    specialization: new FormControl('', { nonNullable: true }),
    experienceYears: new FormControl<number | ''>('', { nonNullable: true }),
    bio: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    password: new FormControl('', { nonNullable: true }),
  });

  // Assign form
  public readonly assignForm = new FormGroup({
    memberId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    trainerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    this.loadData();
  }

  public loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    // Load trainers via user service (role=trainer gives full User objects with email, phone etc.)
    this.userService.getUsers({ role: 'trainer', search: this.searchValue() }).subscribe({
      next: (data) => {
        this.trainers.set(data);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Failed to load trainers.');
        this.loading.set(false);
      },
    });

    // Load members for assignment dropdown
    this.userService.getUsers({ role: 'member' }).subscribe({
      next: (data) => this.members.set(data),
      error: () => { /* silent */ },
    });

    // Load trainer assignment overview for the view modal
    this.userService.getTrainerAssignmentsOverview().subscribe({
      next: (data) => this.assignmentOverview.set(data.trainers),
      error: () => { /* silent, non-critical */ },
    });
  }

  public onSearchChange(event: Event): void {
    this.searchValue.set((event.target as HTMLInputElement).value);
    this.loadData();
  }

  public resetFilters(): void {
    this.searchValue.set('');
    this.loadData();
  }

  // ── Modal helpers ─────────────────────────────────────────────
  public openAdd(): void {
    this.addForm.reset();
    this.error.set(null);
    this.success.set(null);
    this.modalMode.set('add');
  }

  public openEdit(trainer: User): void {
    this.selectedTrainer.set(trainer);
    this.error.set(null);
    this.success.set(null);
    const dob = trainer.dateOfBirth
      ? new Date(trainer.dateOfBirth).toISOString().split('T')[0]
      : '';
    this.editForm.reset({
      fullName: trainer.fullName,
      email: trainer.email,
      phone: trainer.phone,
      gender: trainer.gender,
      dateOfBirth: dob,
      specialization: trainer.specialization ?? '',
      experienceYears: trainer.experienceYears ?? '',
      bio: trainer.bio ?? '',
      password: '',
    });
    this.modalMode.set('edit');
  }

  public openView(trainer: User): void {
    this.selectedTrainer.set(trainer);
    this.modalMode.set('view');
  }

  public openDelete(trainer: User): void {
    this.selectedTrainer.set(trainer);
    this.error.set(null);
    this.modalMode.set('delete');
  }

  public openAssign(): void {
    this.assignForm.reset();
    this.error.set(null);
    this.modalMode.set('assign' as ModalMode);
  }

  public closeModal(): void {
    this.modalMode.set(null);
    this.selectedTrainer.set(null);
  }

  // ── CRUD operations ───────────────────────────────────────────
  public submitAdd(): void {
    this.error.set(null);
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const v = this.addForm.getRawValue();
    const payload: CreateUserPayload & Record<string, unknown> = {
      fullName: v.fullName,
      email: v.email,
      phone: v.phone,
      password: v.password,
      confirmPassword: v.confirmPassword,
      gender: v.gender,
      dateOfBirth: v.dateOfBirth || '',
      role: 'trainer',
    };
    if (v.specialization) payload['specialization'] = v.specialization;
    if (v.experienceYears !== '') payload['experienceYears'] = Number(v.experienceYears);
    if (v.bio) payload['bio'] = v.bio;

    this.userService.createUser(payload as CreateUserPayload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('Trainer added successfully.');
        this.loadData();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to add trainer.');
      },
    });
  }

  public submitEdit(): void {
    this.error.set(null);
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const trainer = this.selectedTrainer();
    if (!trainer) return;
    this.submitting.set(true);
    const v = this.editForm.getRawValue();
    const payload: UpdateUserPayload & Record<string, unknown> = {
      fullName: v.fullName,
      email: v.email,
      phone: v.phone,
      gender: v.gender,
    };
    if (v.dateOfBirth) payload['dateOfBirth'] = v.dateOfBirth;
    if (v.specialization !== undefined) payload['specialization'] = v.specialization;
    if (v.experienceYears !== '') payload['experienceYears'] = Number(v.experienceYears);
    if (v.bio !== undefined) payload['bio'] = v.bio;
    if (v.password) payload['password'] = v.password;

    this.userService.updateUser(trainer._id, payload as UpdateUserPayload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('Trainer updated successfully.');
        this.loadData();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to update trainer.');
      },
    });
  }

  public confirmDelete(): void {
    const trainer = this.selectedTrainer();
    if (!trainer) return;
    this.submitting.set(true);
    this.userService.deleteUser(trainer._id).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('Trainer deleted successfully.');
        this.loadData();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Failed to delete trainer.');
      },
    });
  }

  public assign(): void {
    if (this.assignForm.invalid) return;
    this.submitting.set(true);
    const v = this.assignForm.getRawValue();
    this.trainerService.assignMemberToTrainer(v.memberId, v.trainerId).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.success.set('Member assigned to trainer successfully.');
        this.loadData();
        setTimeout(() => this.success.set(null), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Assignment failed.');
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  public getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  public getAssignedCount(trainerId: string): number {
    const found = this.assignmentOverview().find((t) => t._id === trainerId);
    return found?.assignedMembersCount ?? 0;
  }

  public getAssignedMembers(trainerId: string): { fullName: string; email: string }[] {
    const found = this.assignmentOverview().find((t) => t._id === trainerId);
    return found?.assignedMembers ?? [];
  }

  public isAddInvalid(field: string): boolean {
    const c = this.addForm.get(field);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  public isEditInvalid(field: string): boolean {
    const c = this.editForm.get(field);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  public get addPasswordMismatch(): boolean {
    return !!(
      this.addForm.errors?.['passwordMismatch'] &&
      (this.addForm.get('confirmPassword')?.touched ||
        this.addForm.get('confirmPassword')?.dirty)
    );
  }

  // Expose modal mode string check for the assign modal
  public get showAssignModal(): boolean {
    return (this.modalMode() as string) === 'assign';
  }
}
