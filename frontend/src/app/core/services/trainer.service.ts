import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { PublicTrainer, User } from '../models/auth.models';

export interface AssignMemberPayload {
  memberId: string;
  trainerId: string;
}

@Injectable({
  providedIn: 'root',
})
export class TrainerService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getPublicTrainers(): Observable<PublicTrainer[]> {
    return this.http
      .get<{ success: boolean; count: number; data: PublicTrainer[] }>(
        `${this.apiUrl}/trainers`,
      )
      .pipe(map((res) => res.data));
  }

  assignMemberToTrainer(memberId: string, trainerId: string): Observable<User> {
    return this.http
      .post<{ success: boolean; message: string; data: User }>(
        `${this.apiUrl}/trainers/assign-member`,
        { memberId, trainerId },
      )
      .pipe(map((res) => res.data));
  }
}
