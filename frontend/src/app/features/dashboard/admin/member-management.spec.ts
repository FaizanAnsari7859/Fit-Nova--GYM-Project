import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MemberManagement, RoleTab } from './member-management';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/auth.models';

describe('MemberManagement Component - Role Tabs & Security', () => {
  let component: MemberManagement;
  let fixture: ComponentFixture<MemberManagement>;

  const mockAdminUser: User = {
    _id: 'admin-1',
    fullName: 'Master Admin',
    email: 'admin@test.com',
    phone: '1112223334',
    gender: 'male',
    dateOfBirth: '1985-05-05',
    role: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const mockMembers: User[] = [
    {
      _id: 'm1',
      fullName: 'Alice Member',
      email: 'alice@test.com',
      phone: '1234567890',
      gender: 'female',
      dateOfBirth: '1995-01-01',
      role: 'member',
      assignedTrainer: {
        _id: 't1',
        fullName: 'Trainer John',
        email: 'john@trainer.com',
      } as any,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      _id: 'm2',
      fullName: 'Bob Smith',
      email: 'bob@test.com',
      phone: '9876543210',
      gender: 'male',
      dateOfBirth: '1992-02-02',
      role: 'member',
      assignedTrainer: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    },
  ];

  const mockTrainers: User[] = [
    {
      _id: 't1',
      fullName: 'Trainer John',
      email: 'john@trainer.com',
      phone: '5551234567',
      gender: 'male',
      dateOfBirth: '1988-03-03',
      role: 'trainer',
      specialization: 'Strength Training',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const mockAdmins: User[] = [mockAdminUser];

  const mockUserService = {
    getUsers: vi.fn(),
    getUsersPaged: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  };

  const mockAuthService = {
    currentUser: () => mockAdminUser,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockUserService.getUsers.mockImplementation((filters?: any) => {
      if (filters?.role === 'trainer') return of(mockTrainers);
      if (filters?.role === 'admin') return of(mockAdmins);
      return of(mockMembers);
    });

    mockUserService.getUsersPaged.mockImplementation((filters?: any) => {
      let data = mockMembers;
      if (filters?.role === 'trainer') data = mockTrainers;
      if (filters?.role === 'admin') data = mockAdmins;

      return of({
        success: true,
        count: data.length,
        total: data.length,
        page: filters?.page || 1,
        totalPages: 1,
        limit: filters?.limit || 10,
        data,
      });
    });

    await TestBed.configureTestingModule({
      imports: [MemberManagement],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: UserService, useValue: mockUserService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MemberManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component and default to Members tab showing only members', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('member');
    expect(component.users().length).toBe(2);
    expect(component.users().every((u) => u.role === 'member')).toBe(true);
    expect(component.loading()).toBe(false);
  });

  it('should switch between Members, Trainers, and Admins tabs correctly', () => {
    // Switch to Trainers tab
    component.setTab('trainer');
    expect(component.activeTab()).toBe('trainer');
    expect(component.currentPage()).toBe(1);
    expect(component.users().every((u) => u.role === 'trainer')).toBe(true);

    // Switch to Admins tab
    component.setTab('admin');
    expect(component.activeTab()).toBe('admin');
    expect(component.users().every((u) => u.role === 'admin')).toBe(true);

    // Switch back to Members tab
    component.setTab('member');
    expect(component.activeTab()).toBe('member');
    expect(component.users().every((u) => u.role === 'member')).toBe(true);
  });

  it('should filter by search and gender within the active tab', () => {
    component.onSearchChange({ target: { value: 'Alice' } } as any);
    expect(mockUserService.getUsersPaged).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member', search: 'Alice' }),
    );

    component.onGenderChange({ target: { value: 'female' } } as any);
    expect(mockUserService.getUsersPaged).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member', gender: 'female' }),
    );
  });

  it('should filter members by trainer assignment', () => {
    component.onTrainerFilterChange({ target: { value: 'assigned' } } as any);
    expect(component.users().length).toBe(1);
    expect(component.users()[0].fullName).toBe('Alice Member');

    component.onTrainerFilterChange({ target: { value: 'unassigned' } } as any);
    expect(component.users().length).toBe(1);
    expect(component.users()[0].fullName).toBe('Bob Smith');
  });

  it('should support pagination (previousPage, nextPage, goToPage)', () => {
    // Mock 2 pages of data
    mockUserService.getUsersPaged.mockReturnValue(
      of({
        success: true,
        count: 10,
        total: 20,
        page: 1,
        totalPages: 2,
        limit: 10,
        data: mockMembers,
      }),
    );

    component.loadUsers(1);
    expect(component.currentPage()).toBe(1);
    expect(component.totalPages()).toBe(2);

    // Next page
    component.nextPage();
    expect(mockUserService.getUsersPaged).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    );

    // Previous page
    component.currentPage.set(2);
    component.previousPage();
    expect(mockUserService.getUsersPaged).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it('should open Add User modal preset to the active tab role', () => {
    // On Member tab
    component.openAdd();
    expect(component.modalMode()).toBe('add');
    expect(component.addForm.get('role')?.value).toBe('member');

    component.closeModal();

    // On Trainer tab
    component.setTab('trainer');
    component.openAdd();
    expect(component.modalMode()).toBe('add');
    expect(component.addForm.get('role')?.value).toBe('trainer');
  });

  it('should lock the role when editing to prevent accidental role changes', () => {
    const member = mockMembers[0];
    component.openEdit(member);

    expect(component.modalMode()).toBe('edit');
    expect(component.selectedUser()).toEqual(member);

    mockUserService.updateUser.mockReturnValue(of({ ...member, fullName: 'Alice Updated' }));

    component.editForm.patchValue({ fullName: 'Alice Updated' });
    component.submitEdit();

    // Verifies role payload is strictly locked to member.role
    expect(mockUserService.updateUser).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({
        fullName: 'Alice Updated',
        role: 'member',
      }),
    );
    expect(component.modalMode()).toBeNull();
  });

  it('should prevent an admin from deleting their own account', () => {
    component.setTab('admin');

    // Attempt to open delete for self
    component.openDelete(mockAdminUser);
    expect(component.error()).toBe('You cannot delete your own admin account.');
    expect(component.modalMode()).toBeNull();
  });

  it('should allow deleting a member successfully', () => {
    const member = mockMembers[1];
    component.openDelete(member);
    expect(component.modalMode()).toBe('delete');

    mockUserService.deleteUser.mockReturnValue(of(undefined as any));
    component.confirmDelete();

    expect(mockUserService.deleteUser).toHaveBeenCalledWith('m2');
    expect(component.modalMode()).toBeNull();
  });

  it('should view user details correctly including trainer and assigned member status', () => {
    const member = mockMembers[0];
    component.openView(member);
    expect(component.modalMode()).toBe('view');
    expect(component.getTrainerName(member)).toBe('Trainer John');

    const unassigned = mockMembers[1];
    expect(component.getTrainerName(unassigned)).toBe('Unassigned');
  });
});
