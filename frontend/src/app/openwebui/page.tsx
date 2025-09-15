export default function OpenWebUIPage() {
  return (
    <div style={{ height: '90vh' }} className="w-full">
      <iframe
        src="http://localhost:3000"
        className="w-full h-full"
        style={{ border: 'none' }}
      />
    </div>
  );
}

