
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import ReactQuill from 'react-quill-new';
import { auth, db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface Post {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  authorId: string;
  authorEmail: string;
  createdAt: Timestamp | null;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const quillRef = useRef<ReactQuill>(null);
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [featuredImage, setFeaturedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // --- Image Upload Helper ---
  const uploadImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!user) return reject("No user authenticated");
      
      const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => reject(error),
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  // --- Quill Custom Image Handler ---
  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        try {
          const url = await uploadImage(file);
          const quill = quillRef.current?.getEditor();
          if (quill) {
            const range = quill.getSelection();
            quill.insertEmbed(range?.index || 0, 'image', url);
            setUploadProgress(0);
          }
        } catch (err) {
          console.error("Quill image upload failed:", err);
          alert("Failed to upload image to editor.");
        }
      }
    };
  };

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, false] }],
        ['bold', 'italic', 'underline', 'strike', 'blockquote'],
        [{'list': 'ordered'}, {'list': 'bullet'}],
        ['link', 'image', 'clean'] // Added 'image' to toolbar
      ],
      handlers: {
        image: imageHandler
      }
    },
  }), [user]);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike', 'blockquote',
    'list',
    'link',
    'image'
  ];

  useEffect(() => {
    setPermissionError(null);
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const postsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Post[];
        setPosts(postsData);
        setIsInitialLoading(false);
      }, 
      (error) => {
        console.error("Firestore Error:", error);
        if (error.code === 'permission-denied') {
          setPermissionError("Access Denied: Check your Firestore rules.");
        }
        setIsInitialLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleFeaturedImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFeaturedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const isContentEmpty = !content || content === '<p><br></p>';
    if (!title.trim() || isContentEmpty || !user) return;

    setIsSubmitting(true);
    setPermissionError(null);
    
    try {
      let imageUrl = '';
      if (featuredImage) {
        imageUrl = await uploadImage(featuredImage);
      }

      await addDoc(collection(db, 'posts'), {
        title: title.trim(),
        content: content,
        imageUrl: imageUrl,
        authorId: user.uid,
        authorEmail: user.email || 'Anonymous',
        createdAt: serverTimestamp(),
      });
      
      setTitle('');
      setContent('');
      setFeaturedImage(null);
      setImagePreview(null);
      setUploadProgress(0);
    } catch (err: any) {
      console.error("Error creating post:", err);
      if (err.code === 'permission-denied') {
        setPermissionError("Write Denied: Check Firestore and Storage rules.");
      } else {
        alert("Failed to save post. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert("Permission Denied: You can only delete your own posts.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Navigation Header */}
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl shadow-sm border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div 
          className="flex items-center space-x-3 cursor-pointer group" 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-100 shadow-lg group-hover:rotate-6 transition-transform">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-xl font-black text-slate-800 tracking-tight">GalleryBoard</span>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Active Member</p>
            <p className="text-sm text-slate-900 font-bold">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto mt-10 px-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Post Creation Form */}
        <div className="lg:col-span-5 lg:sticky lg:top-28 self-start">
          <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
            <div className="p-8 pb-4">
              <h2 className="text-xl font-black text-slate-900 mb-2">Create New Post</h2>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Images supported in feed and editor</p>
            </div>
            
            <form onSubmit={handleCreatePost} className="space-y-0">
              <div className="px-8 pb-4">
                <input
                  type="text"
                  placeholder="Subject or Title"
                  className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Featured Image Selector */}
              <div className="px-8 pb-4">
                <div className="relative group">
                  {imagePreview ? (
                    <div className="relative h-40 w-full rounded-2xl overflow-hidden border border-slate-100">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => {setFeaturedImage(null); setImagePreview(null);}}
                        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-all group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-2 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-xs font-bold text-slate-500 group-hover:text-indigo-600 uppercase">Cover Photo</p>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFeaturedImageChange} />
                    </label>
                  )}
                </div>
              </div>
              
              <div className="px-8 pb-8">
                <div className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                  <ReactQuill 
                    ref={quillRef}
                    theme="snow" 
                    value={content} 
                    onChange={setContent}
                    modules={modules}
                    formats={formats}
                    placeholder="Tell your story... click image icon to upload inline"
                  />
                </div>
              </div>

              {uploadProgress > 0 && (
                <div className="px-8 pb-4">
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                  <p className="text-[10px] font-black text-indigo-600 mt-1 uppercase text-right">Uploading... {Math.round(uploadProgress)}%</p>
                </div>
              )}

              <div className="px-8 pb-8">
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim() || !content || content === '<p><br></p>'}
                  className={`w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center space-x-2 ${
                    isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-1 active:scale-95'
                  }`}
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span>Publish with Photos</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Posts Feed */}
        <div className="lg:col-span-7 space-y-8">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-2xl font-black text-slate-900">Latest Updates</h3>
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-full">
              {posts.length} Posts
            </span>
          </div>

          {isInitialLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100">
              <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="mt-4 text-slate-400 font-bold text-xs uppercase tracking-widest">Gathering Photos...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-16 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h4 className="text-lg font-black text-slate-900">Gallery is empty</h4>
              <p className="text-slate-500 mt-2">Be the first to share a visual story!</p>
            </div>
          ) : (
            <div className="grid gap-8">
              {posts.map((post) => (
                <article 
                  key={post.id} 
                  className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden hover:shadow-indigo-50 transition-all duration-300 group"
                >
                  {post.imageUrl && (
                    <div className="h-64 sm:h-80 w-full overflow-hidden">
                      <img 
                        src={post.imageUrl} 
                        alt={post.title} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                      />
                    </div>
                  )}
                  
                  <div className="p-8">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-100">
                          {post.authorEmail.substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{post.authorEmail.split('@')[0]}</p>
                          <p className="text-xs font-bold text-slate-400">
                            {post.createdAt ? new Date(post.createdAt.toDate()).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : 'Just now'}
                          </p>
                        </div>
                      </div>
                      
                      {user?.uid === post.authorId && (
                        <button 
                          onClick={() => handleDeletePost(post.id)}
                          className="w-10 h-10 flex items-center justify-center text-slate-200 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                    
                    <h4 className="text-2xl font-black text-slate-900 mb-4 group-hover:text-indigo-600 transition-colors">{post.title}</h4>
                    
                    <div 
                      className="text-slate-600 leading-relaxed text-lg post-content-rich"
                      dangerouslySetInnerHTML={{ __html: post.content }}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
