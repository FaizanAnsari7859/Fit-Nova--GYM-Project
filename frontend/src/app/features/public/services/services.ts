import { ChangeDetectionStrategy, Component } from '@angular/core';

interface ServiceCard {
  title: string;
  description: string;
}

@Component({
  selector: 'app-services',
  templateUrl: './services.html',
  styleUrl: './services.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Services {
  protected readonly services: ServiceCard[] = [
    {
      title: 'Personal Training',
      description: 'One-to-one coaching with a program written around your schedule and goals.',
    },
    {
      title: 'Weight Training',
      description: 'Barbells, machines, and progressive lifting for strength that shows up in daily life.',
    },
    {
      title: 'Cardio Training',
      description: 'Intervals, assault bikes, and conditioning blocks that build a stronger engine.',
    },
    {
      title: 'Yoga & Meditation',
      description: 'Mobility, breath work, and recovery sessions to keep training sustainable.',
    },
    {
      title: 'Strength Training',
      description: 'Compound lifts and accessory work coached with clean technique.',
    },
    {
      title: 'Nutrition Guidance',
      description: 'Practical meal direction that matches your training load and preferences.',
    },
  ];
}
