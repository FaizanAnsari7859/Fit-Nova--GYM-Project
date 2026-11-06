import { ChangeDetectionStrategy, Component } from '@angular/core';

interface GalleryImage {
  src: string;
  alt: string;
}

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  styleUrl: './gallery.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Gallery {
  protected readonly images: GalleryImage[] = [
    { src: '/images/gallery-1.jpg', alt: 'Weight room prepared for a training session' },
    { src: '/images/gallery-2.jpg', alt: 'Athlete holding a deep stretch' },
    { src: '/images/gallery-3.jpg', alt: 'Group training on the gym floor' },
    { src: '/images/gallery-4.jpg', alt: 'Barbell strength session' },
    { src: '/images/gallery-5.jpg', alt: 'Conditioning work with battle ropes' },
    { src: '/images/gallery-6.jpg', alt: 'Outdoor fitness movement' },
  ];
}
