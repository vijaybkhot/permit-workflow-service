export interface RegisterBody {
  orgName: string;
  email: string;
  password: string;
}

export interface LoginBody {
  email: string;
  password: string;
}
