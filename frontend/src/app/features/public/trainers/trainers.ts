import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { TrainerService } from '../../../core/services/trainer.service';
import { PublicTrainer } from '../../../core/models/auth.models';

@Component({
  selector: 'app-trainers',
  templateUrl: './trainers.html',
  styleUrl: './trainers.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Trainers implements OnInit {
  private readonly trainerService = inject(TrainerService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly trainers = signal<PublicTrainer[]>([]);

  ngOnInit(): void {
    this.loadTrainers();
  }

  protected loadTrainers(): void {
    this.loading.set(true);
    this.error.set(null);

    this.trainerService.getPublicTrainers().subscribe({
      next: (data) => {
        this.trainers.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load coaches. Please try again later.');
        this.loading.set(false);
      },
    });
  }

  protected getTrainerImage(trainer: PublicTrainer, index: number): string {
    if (trainer.profileImage && trainer.profileImage.trim().length > 0) {
      return trainer.profileImage;
    }
    const defaultImages = [
      '/images/trainer-2.jpg',
      '/images/trainer-1.jpg',
      '/images/trainer-3.jpg',
      '/images/trainer-4.jpg',
    ];
    return defaultImages[index % defaultImages.length];
  }
}
