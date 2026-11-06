import { ChangeDetectionStrategy, Component } from '@angular/core';

interface TrainerCard {
  name: string;
  specialization: string;
  experience: string;
  image: string;
  alt: string;
}

@Component({
  selector: 'app-trainers',
  templateUrl: './trainers.html',
  styleUrl: './trainers.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Trainers {
  protected readonly trainers: TrainerCard[] = [
    {
      name: 'Aria Shah',
      specialization: 'Strength & powerlifting',
      experience: '8 years',
      image: '/images/trainer-2.jpg',
      alt: 'Coach Aria Shah on the training floor',
    },
    {
      name: 'Leo Martins',
      specialization: 'Athletic conditioning',
      experience: '6 years',
      image: '/images/trainer-1.jpg',
      alt: 'Coach Leo Martins demonstrating a lift',
    },
    {
      name: 'Maya Chen',
      specialization: 'Yoga & mobility',
      experience: '10 years',
      image: '/images/trainer-3.jpg',
      alt: 'Coach Maya Chen leading a mobility session',
    },
    {
      name: 'Jordan Hale',
      specialization: 'Nutrition coaching',
      experience: '7 years',
      image: '/images/trainer-4.jpg',
      alt: 'Coach Jordan Hale during a training session',
    },
  ];
}
