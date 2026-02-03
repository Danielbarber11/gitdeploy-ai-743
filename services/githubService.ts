
import { FileContent } from '../types';

export class GitHubService {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async fetchGitHub(url: string, options: RequestInit = {}) {
    const response = await fetch(`https://api.github.com${url}`, {
      ...options,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'GitHub API error');
    }

    return response.json();
  }

  async createRepo(name: string) {
    return this.fetchGitHub('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name,
        auto_init: true,
        private: false,
      }),
    });
  }

  async uploadFiles(owner: string, repo: string, files: FileContent[]) {
    // Simplified: Uploading individual files
    // In a real app, this should use the Tree API for many files
    for (const file of files) {
      const content = file.binary ? file.content : btoa(unescape(encodeURIComponent(file.content)));
      
      try {
        // Try to get file first to see if it exists (for updates)
        let sha;
        try {
          const existing = await this.fetchGitHub(`/repos/${owner}/${repo}/contents/${file.path}`);
          sha = existing.sha;
        } catch (e) { /* ignore if not exists */ }

        await this.fetchGitHub(`/repos/${owner}/${repo}/contents/${file.path}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: `Deploying ${file.path}`,
            content: content,
            sha: sha
          }),
        });
      } catch (err) {
        console.error(`Failed to upload ${file.path}`, err);
      }
    }
  }

  async enablePages(owner: string, repo: string) {
    try {
      return await this.fetchGitHub(`/repos/${owner}/${repo}/pages`, {
        method: 'POST',
        body: JSON.stringify({
          source: {
            branch: 'main',
            path: '/'
          }
        }),
      });
    } catch (e) {
      // Might already be enabled or take time
      console.log("Pages enable call status:", e);
    }
  }

  async getUser() {
    return this.fetchGitHub('/user');
  }
}
