
export interface Project {
  id: string;
  name: string;
  repoName: string;
  deployedUrl: string;
  githubUrl: string;
  type: 'html' | 'zip';
  timestamp: number;
  lastDeploymentStatus: 'success' | 'failed' | 'pending';
}

export interface FileContent {
  path: string;
  content: string;
  binary?: boolean;
}

export interface DeploymentLog {
  message: string;
  status: 'info' | 'success' | 'error';
  timestamp: number;
}
