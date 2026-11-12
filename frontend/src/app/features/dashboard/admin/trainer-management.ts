import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TrainerService, AssignMemberPayload } from '../../../core/services/trainer.service';
import { UserService } from '../../../core/services/user.service';
import { PublicTrainer, User } from '../../../core/models/auth.models';

@Component({
  selector: 'app-trainer-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './trainer-management.html',
  styleUrl: './trainer-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainerManagement implements OnInit {
  private readonly trainerService = inject(TrainerService);
  private readonly userService = inject(UserService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly trainers = signal<PublicTrainer[]>([]);
  protected readonly members = signal<User[]>([]);
  protected readonly showAssign = signal(false);

  openAssign(): void {
    this.showAssign.set(true);
  }

  closeAssign(): void {
    this.showAssign.set(false);
    // reset form for next use
    this.assignForm.reset();
  }


  // Simple assignment form
  protected readonly assignForm = new FormGroup({
    memberId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    trainerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    // Load trainers
    this.trainerService.getPublicTrainers().subscribe({
      next: (data) => this.trainers.set(data),
      error: (err: HttpErrorResponse) => this.error.set('Failed to load trainers.'),
    });
    // Load members for assignment dropdown (admin only view)
    this.userService.getUsers({ role: 'member' }).subscribe({
      next: (data) => this.members.set(data),
      error: () => {/* ignore error, members may be empty */},
    });
    this.loading.set(false);
  }

  protected assign(): void {
    if (this.assignForm.invalid) return;
    this.submitting.set(true);
    const payload: AssignMemberPayload = {
      memberId: this.assignForm.get('memberId')!.value,
      trainerId: this.assignForm.get('trainerId')!.value,
    };
    this.trainerService.assignMemberToTrainer(payload.memberId, payload.trainerId).subscribe({
      next: () => {
        this.success.set('Member assigned to trainer successfully.');
        this.submitting.set(false);
        setTimeout(() => this.success.set(null), 4000);
        this.assignForm.reset();
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err?.error?.message ?? 'Assignment failed.');
        this.submitting.set(false);
      },
    });
  }
}
