export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tong quan</h1>
      <p className="text-muted-foreground">
        Chao mung den voi he thong ERP Ngo Quyen. Chon phan he tu menu ben trai de bat dau.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <div className="border rounded-lg p-4 space-y-1">
          <h3 className="font-semibold">Du an</h3>
          <p className="text-sm text-muted-foreground">Quan ly du an xay dung</p>
        </div>
        <div className="border rounded-lg p-4 space-y-1">
          <h3 className="font-semibold">Cong no</h3>
          <p className="text-sm text-muted-foreground">Theo doi cong no vat tu &amp; nhan cong</p>
        </div>
        <div className="border rounded-lg p-4 space-y-1">
          <h3 className="font-semibold">Tai chinh</h3>
          <p className="text-sm text-muted-foreground">Bao cao tai chinh tong hop</p>
        </div>
      </div>
    </div>
  );
}
