
import React, { useState, useEffect, useRef } from 'react';
import { Project, FileContent, DeploymentLog } from './types';
import { GitHubService } from './services/githubService';
import { troubleshootDeployment } from './services/geminiService';

declare const JSZip: any;

const App: React.FC = () => {
  const [githubToken, setGithubToken] = useState<string>(() => localStorage.getItem('gh_token') || '');
  const [projects, setProjects] = useState<Project[]>(() => JSON.parse(localStorage.getItem('projects') || '[]'));
  const [isDeploying, setIsDeploying] = useState(false);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [showTokenInput, setShowTokenInput] = useState(!githubToken);
  const [showTroubleshoot, setShowTroubleshoot] = useState<Project | null>(null);
  const [troubleshootData, setTroubleshootData] = useState<{analysis: string, solution: string, codeFix: string} | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [htmlCode, setHtmlCode] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('gh_token', githubToken);
  }, [githubToken]);

  useEffect(() => {
    localStorage.setItem('projects', JSON.stringify(projects));
  }, [projects]);

  const addLog = (message: string, status: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { message, status, timestamp: Date.now() }]);
  };

  const handleDeployHtml = async () => {
    if (!githubToken) {
      alert('נא להזין טוקן גיטהב בהגדרות');
      setShowTokenInput(true);
      return;
    }
    if (!htmlCode.trim()) return;

    setIsDeploying(true);
    setLogs([]);
    const projectName = `web-deploy-${Date.now()}`;
    
    try {
      const gh = new GitHubService(githubToken);
      const user = await gh.getUser();
      
      addLog('מייצר רפוזיטורי חדש בגיטהב...');
      const repo = await gh.createRepo(projectName);
      
      addLog('מעלה קבצים...');
      const files: FileContent[] = [
        { path: 'index.html', content: htmlCode }
      ];
      await gh.uploadFiles(user.login, projectName, files);
      
      addLog('מפעיל GitHub Pages...');
      await gh.enablePages(user.login, projectName);
      
      const deployedUrl = `https://${user.login}.github.io/${projectName}/`;
      const newProject: Project = {
        id: crypto.randomUUID(),
        name: projectName,
        repoName: projectName,
        deployedUrl,
        githubUrl: repo.html_url,
        type: 'html',
        timestamp: Date.now(),
        lastDeploymentStatus: 'success'
      };

      setProjects(prev => [newProject, ...prev]);
      addLog('הפריסה הושלמה בהצלחה!', 'success');
      
      setTimeout(() => {
        window.open(deployedUrl, '_blank');
        setIsDeploying(false);
      }, 2000);

    } catch (error: any) {
      addLog(`שגיאה: ${error.message}`, 'error');
      setIsDeploying(false);
    }
  };

  const processZip = async (file: File) => {
    if (!githubToken) {
      alert('נא להזין טוקן גיטהב בהגדרות');
      setShowTokenInput(true);
      return;
    }

    setIsDeploying(true);
    setLogs([]);
    const projectName = file.name.replace('.zip', '').toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);

    try {
      const gh = new GitHubService(githubToken);
      const user = await gh.getUser();
      
      addLog('קורא את קובץ ה-ZIP...');
      const zip = await JSZip.loadAsync(file);
      const files: FileContent[] = [];
      
      for (const [path, zipEntry] of Object.entries(zip.files) as any) {
        if (!zipEntry.dir) {
          const content = await zipEntry.async('base64');
          files.push({ path, content, binary: true });
        }
      }

      addLog(`מייצר רפוזיטורי: ${projectName}...`);
      const repo = await gh.createRepo(projectName);
      
      addLog(`מעלה ${files.length} קבצים...`);
      await gh.uploadFiles(user.login, projectName, files);
      
      addLog('מפעיל GitHub Pages...');
      await gh.enablePages(user.login, projectName);
      
      const deployedUrl = `https://${user.login}.github.io/${projectName}/`;
      const newProject: Project = {
        id: crypto.randomUUID(),
        name: projectName,
        repoName: projectName,
        deployedUrl,
        githubUrl: repo.html_url,
        type: 'zip',
        timestamp: Date.now(),
        lastDeploymentStatus: 'success'
      };

      setProjects(prev => [newProject, ...prev]);
      addLog('הפריסה הושלמה בהצלחה!', 'success');
      
      setTimeout(() => {
        window.open(deployedUrl, '_blank');
        setIsDeploying(false);
      }, 2000);

    } catch (error: any) {
      addLog(`שגיאה: ${error.message}`, 'error');
      setIsDeploying(false);
    }
  };

  const handleUpdateZip = async (projectId: string, file: File) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    setIsDeploying(true);
    setLogs([]);
    addLog(`מעדכן את הפרויקט ${project.name}...`);

    try {
      const gh = new GitHubService(githubToken);
      const user = await gh.getUser();
      const zip = await JSZip.loadAsync(file);
      const files: FileContent[] = [];
      
      for (const [path, zipEntry] of Object.entries(zip.files) as any) {
        if (!zipEntry.dir) {
          const content = await zipEntry.async('base64');
          files.push({ path, content, binary: true });
        }
      }

      addLog('מעלה קבצים מעודכנים...');
      await gh.uploadFiles(user.login, project.repoName, files);
      
      addLog('העדכון הושלם!', 'success');
      
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, timestamp: Date.now() } : p));
      
      setTimeout(() => {
        window.open(project.deployedUrl, '_blank');
        setIsDeploying(false);
      }, 2000);
    } catch (error: any) {
      addLog(`שגיאה בעדכון: ${error.message}`, 'error');
      setIsDeploying(false);
    }
  };

  const handleTroubleshoot = async (project: Project) => {
    setIsAnalyzing(true);
    setShowTroubleshoot(project);
    setTroubleshootData(null);
    
    // Simulate getting file list - in real app we'd fetch from GH
    const dummyFiles = ['index.html', 'style.css', 'script.js', 'assets/logo.png'];
    const result = await troubleshootDeployment(dummyFiles, "המסך נשאר לבן בטעינה.");
    setTroubleshootData(result);
    setIsAnalyzing(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      processZip(file);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 glass-panel p-6 rounded-3xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">GitDeploy AI</h1>
            <p className="text-sm text-slate-500">פרסם את האתר שלך בגיטהב בשניות</p>
          </div>
        </div>
        <button 
          onClick={() => setShowTokenInput(!showTokenInput)}
          className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-indigo-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          הגדרות גיטהב
        </button>
      </header>

      {/* GitHub Token Setup */}
      {showTokenInput && (
        <div className="glass-panel p-6 rounded-3xl animate-in slide-in-from-top duration-300">
          <h2 className="text-lg font-bold mb-4">הגדרת GitHub Personal Access Token</h2>
          <p className="text-sm text-slate-600 mb-4">
            עליך ליצור טוקן בגיטהב עם הרשאות "repo" כדי לאפשר לאפליקציה ליצור רפוזיטורים עבורך.
          </p>
          <div className="flex flex-col md:flex-row gap-3">
            <input 
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              className="flex-1 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
            <button 
              onClick={() => setShowTokenInput(false)}
              className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              שמור טוקן
            </button>
          </div>
        </div>
      )}

      {/* Main Deployment Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* HTML Section */}
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
              </span>
              הוספת קוד HTML
            </h2>
          </div>
          <textarea 
            placeholder="הדבק כאן קוד HTML מלא..."
            className="w-full h-64 p-4 border rounded-3xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm shadow-inner bg-white"
            value={htmlCode}
            onChange={(e) => setHtmlCode(e.target.value)}
          />
          <button 
            disabled={isDeploying || !htmlCode.trim()}
            onClick={handleDeployHtml}
            className={`w-full py-4 rounded-2xl font-bold transition-all shadow-lg ${isDeploying ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800 hover:-translate-y-1'}`}
          >
            {isDeploying ? 'מפרסם...' : 'פרסם בגיטהב'}
          </button>
        </div>

        {/* ZIP Section */}
        <div className="flex flex-col space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </span>
            העלאת קובץ ZIP (Node.js/Static)
          </h2>
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file && file.name.endsWith('.zip')) processZip(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex-1 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition-all cursor-pointer bg-white min-h-[256px] ${isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
          >
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </div>
            <p className="text-lg font-medium text-slate-900">גרור לכאן את קובץ ה-ZIP</p>
            <p className="text-sm text-slate-500 mt-2">או לחץ לבחירה מהמחשב</p>
            <input type="file" ref={fileInputRef} className="hidden" accept=".zip" onChange={onFileChange} />
          </div>
        </div>
      </div>

      {/* Deployment Status Logs */}
      {logs.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl max-h-60 overflow-y-auto space-y-2">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
            תהליך פריסה בתצוגה חיה
          </h3>
          {logs.map((log, i) => (
            <div key={i} className={`text-sm flex items-center gap-3 ${log.status === 'error' ? 'text-red-600' : log.status === 'success' ? 'text-green-600' : 'text-slate-600'}`}>
              <span className="opacity-40 font-mono text-[10px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
              {log.message}
            </div>
          ))}
        </div>
      )}

      {/* Published Projects List */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold">האתרים שלי שפורסמו</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.length === 0 ? (
            <div className="col-span-full py-12 text-center glass-panel rounded-3xl">
              <p className="text-slate-500">טרם פורסמו פרויקטים. התחל בפרסום הראשון שלך!</p>
            </div>
          ) : (
            projects.map((project) => (
              <div key={project.id} className="glass-panel rounded-3xl overflow-hidden hover:shadow-xl transition-all group border border-slate-100">
                <div className="bg-slate-50 h-32 flex items-center justify-center overflow-hidden border-b relative">
                  <div className="absolute inset-0 bg-gradient-to-tr from-indigo-50 to-transparent opacity-50"></div>
                  <div className="text-3xl font-bold text-slate-200 select-none uppercase">{project.type}</div>
                  <div className="absolute top-3 right-3 flex gap-2">
                     <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${project.lastDeploymentStatus === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {project.lastDeploymentStatus}
                     </span>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <h3 className="font-bold text-slate-900 truncate">{project.name}</h3>
                    <p className="text-xs text-slate-500">{new Date(project.timestamp).toLocaleDateString()}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <a 
                      href={project.deployedUrl} 
                      target="_blank" 
                      className="flex-1 px-4 py-2 bg-slate-900 text-white text-center rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
                    >
                      צפה באתר
                    </a>
                    <button 
                      onClick={() => handleTroubleshoot(project)}
                      className="p-2 border rounded-xl text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm"
                      title="פתור תקלות"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                    </button>
                  </div>

                  <div className="pt-2 border-t">
                    <label className="text-xs font-bold text-slate-500 block mb-2">עדכן גרסה (ZIP)</label>
                    <input 
                      type="file" 
                      accept=".zip" 
                      className="hidden" 
                      id={`update-${project.id}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpdateZip(project.id, file);
                      }}
                    />
                    <button 
                      onClick={() => document.getElementById(`update-${project.id}`)?.click()}
                      className="w-full py-2 border-2 border-dashed border-slate-200 text-slate-500 rounded-xl text-xs font-medium hover:border-indigo-400 hover:text-indigo-500 transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      העלה גרסה חדשה
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Troubleshoot Modal */}
      {showTroubleshoot && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold">פתרון תקלות מבוסס AI</h2>
                <p className="text-slate-500">ניתוח אוטומטי של הפרויקט: {showTroubleshoot.name}</p>
              </div>
              <button 
                onClick={() => setShowTroubleshoot(null)}
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {isAnalyzing ? (
              <div className="py-20 flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-600 font-medium">Gemini מנתח את הפרויקט שלך...</p>
              </div>
            ) : troubleshootData ? (
              <div className="space-y-6">
                <div className="p-4 bg-yellow-50 border-r-4 border-yellow-400 rounded-lg">
                  <h4 className="font-bold text-yellow-800 mb-1">אבחנה:</h4>
                  <p className="text-sm text-yellow-700 leading-relaxed">{troubleshootData.analysis}</p>
                </div>
                
                <div className="p-4 bg-indigo-50 border-r-4 border-indigo-400 rounded-lg">
                  <h4 className="font-bold text-indigo-800 mb-1">הפתרון המוצע:</h4>
                  <p className="text-sm text-indigo-700 leading-relaxed">{troubleshootData.solution}</p>
                </div>

                {troubleshootData.codeFix && (
                  <div>
                    <h4 className="font-bold text-slate-900 mb-2">שינוי קוד נדרש:</h4>
                    <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-xs overflow-x-auto">
                      <code>{troubleshootData.codeFix}</code>
                    </pre>
                  </div>
                )}

                <button 
                  onClick={() => setShowTroubleshoot(null)}
                  className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all"
                >
                  הבנתי, תודה!
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 text-center text-slate-400 text-sm">
        GitDeploy AI &bull; מופעל על ידי Gemini ו-GitHub API
      </footer>
    </div>
  );
};

export default App;
