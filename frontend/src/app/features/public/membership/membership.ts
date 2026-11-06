import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Plan {
  name: string;
  price: string;
  duration: string;
  features: string[];
  featured: boolean;
}

@Component({
  selector: 'app-membership',
  imports: [RouterLink],
  templateUrl: './membership.html',
  styleUrl: './membership.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Membership {
  protected readonly plans: Plan[] = [
    {
      name: 'Basic Plan',
      price: '$49',
      duration: 'Billed monthly',
      featured: false,
      features: ['Gym floor access', 'Locker and shower', '2 group classes each week', 'Opening fitness assessment'],
    },
    {
      name: 'Premium Plan',
      price: '$89',
      duration: '3-month commitment',
      featured: true,
      features: ['Unlimited classes', 'Monthly coach check-in', 'Nutrition starter guide', 'Guest pass once a month'],
    },
    {
      name: 'VIP Plan',
      price: '$149',
      duration: '12-month commitment',
      featured: false,
      features: ['Private coaching block', 'Recovery room access', 'Custom meal direction', 'Priority class booking'],
    },
  ];
}
