import { ChangeDetectionStrategy, Component } from '@angular/core';
import { About } from '../about/about';
import { Contact } from '../contact/contact';
import { Gallery } from '../gallery/gallery';
import { Hero } from '../hero/hero';
import { Membership } from '../membership/membership';
import { Services } from '../services/services';
import { Trainers } from '../trainers/trainers';

@Component({
  selector: 'app-home',
  imports: [Hero, About, Services, Trainers, Membership, Gallery, Contact],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
