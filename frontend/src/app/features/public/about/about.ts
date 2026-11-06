import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-about',
  templateUrl: './about.html',
  styleUrl: './about.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  protected readonly highlights = [
    { value: '12+', label: 'Years coaching' },
    { value: '40+', label: 'Expert trainers' },
    { value: '2.5k', label: 'Active members' },
    { value: '24/7', label: 'Floor access' },
  ];
}
