import { Component, OnInit } from '@angular/core';
import { ProductoService } from '../../../services/productos/producto.service';
import { VentaService } from '../../../services/principal-ventas/venta.service';
import { Producto } from '../../../models/Producto';
import { Venta } from '../../../models/Venta';
import { DetalleVenta } from '../../../models/DetalleVenta';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-principal-ventas',
  templateUrl: './principal-ventas.component.html',
  styleUrls: ['./principal-ventas.component.css']
})
export class PrincipalVentasComponent implements OnInit {
  codigoBarras: string = '';
  ventaProductos: Producto[] = [];
  productos: Producto[] = [];
  totalVenta: number = 0;
  subtotal: number = 0;
  cantidadTotal: number = 0;
  recibido: number = 0;
  cambioFinal: number = 0;
  cambio: number = 0;
  formaPago: string = '';
  numeroNotificaciones: number = 0;
  tipoDescuento: string = '0';
  descuentoPersonalizado: number = 0;
  private debounceTimer: any;
  public dropdownOpen: { [key: string]: boolean } = {}; // Estado de los desplegables

  constructor(private productoService: ProductoService, private ventaService: VentaService) {}

  ngOnInit(): void {
    this.productoService.getProductosBajoStock().subscribe(
      (data) => {
        this.numeroNotificaciones = data.length;
      },
      error => console.error('Error al obtener productos con bajo stock', error)
    );
    this.cargarProductos();
  }

  cargarProductos() {
    this.productoService.getProductos().subscribe(data => this.productos = data);
  }

  onEnterKey(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    const inputElement = keyboardEvent.target as HTMLInputElement;
    const codigoBarras = inputElement.value.trim();

    if (codigoBarras) {
      const producto = this.productos.find(p => p.codigo_Barras.toString() === codigoBarras);
      if (producto) {
        if (producto.cantidad_Stock > 0) {
          this.agregarProductoAVenta(producto, 1);
          inputElement.value = '';
        } else {
          alert('El producto está agotado y no se puede agregar a la venta.');
        }
      } else {
        alert('Producto no encontrado.');
      }
    }
  }

  onCodigoBarrasChange(event: KeyboardEvent) {
    clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      const inputElement = event.target as HTMLInputElement;
      const codigoBarras = inputElement.value.trim();
      if (!codigoBarras) {
        return;
      }
      const producto = this.productos.find(p => p.codigo_Barras.toString() === codigoBarras);
      if (producto) {
        if (producto.cantidad_Stock > 0) {
          this.agregarProductoAVenta(producto, 1); // Pasar cantidad 1
          inputElement.value = '';
        } else {
          alert('El producto está agotado y no se puede agregar a la venta.');
        }
      } else {
        alert('Producto no encontrado.');
      }
    }, 700); // Tiempo en milisegundos para el retraso
  }

  agregarProductoAVenta(producto: Producto, cantidad: number) {
    if (producto.cantidad_Stock < cantidad) {
      alert('No hay suficiente stock del producto para la cantidad solicitada.');
      return;
    }

    const productoEnVenta = this.ventaProductos.find(p => p.codigo_Barras === producto.codigo_Barras);
    if (productoEnVenta) {
      productoEnVenta.cantidad = (productoEnVenta.cantidad || 0) + cantidad;
    } else {
      this.ventaProductos.push({ ...producto, cantidad: cantidad });
    }
    this.calcularTotales();
  }

  eliminarProductoDeVenta(codigoBarras: number) {
    this.ventaProductos = this.ventaProductos.filter(p => p.codigo_Barras !== codigoBarras);
    this.calcularTotales();
  }

  calcularTotales() {
    this.subtotal = this.ventaProductos.reduce((acc, producto) => acc + producto.precio_Venta * (producto.cantidad ?? 0), 0);
    this.aplicarDescuento();
    this.totalVenta = this.subtotal;
  }

  actualizarStockProducto(codigoBarras: number, cantidad: number) {
    this.productoService.updateStock(codigoBarras, cantidad).subscribe(
      response => {
        console.log('Stock actualizado:', response);
      },
      error => {
        console.error('Error al actualizar el stock:', error);
      }
    );
  }

  pagar() {
    console.log('pagando');
    if (this.ventaProductos.length === 0) {
      alert('No hay productos en el carrito. No se puede realizar el pago.');
      return;
    }

    if (this.recibido >= this.totalVenta) {
      this.cambio = this.recibido - this.totalVenta;
      this.cambioFinal = this.cambio;

      // Actualiza el stock en el servidor
      this.ventaProductos.forEach(producto => {
        const productoEnStock = this.productos.find(p => p.codigo_Barras === producto.codigo_Barras);
        if (productoEnStock) {
          const nuevaCantidad = producto.cantidad_Stock - (producto.cantidad || 0);
          this.actualizarStockProducto(producto.id_Producto, nuevaCantidad);
        }
      });

      // Mostrar el cuadro de confirmación
      const generarTicket = window.confirm('¿Deseas generar un ticket?');
      this.registrarVenta(generarTicket);
      this.vaciarVenta();
    } else {
      alert('La cantidad recibida es menor al total de la venta');
    }
  }

  registrarVenta(generarTicket: boolean) {
    const venta: Omit<Venta, 'id_Venta'> = {
      id_Usuario: 'USR001', // Aquí va el ID del empleado
      fecha: new Date(),
      metodo_Pago: this.formaPago = "Efectivo",
      caja: 1
    };

    this.ventaService.registrarVenta(venta).subscribe({
      next: response => {
        console.log('Respuesta del servidor:', response);
        const idVenta = response.id_Venta; // Recibir el ID de venta del servidor

        // Asegúrate de que los detalles contienen el idVenta
        const detallesConIdVenta: any = this.ventaProductos.map(producto => ({
          id_Venta: idVenta,
          id_Producto: producto.id_Producto,
          cantidad: producto.cantidad,
          descuento: this.tipoDescuento // Ajusta según sea necesario
        }));

        // Imprimir los detalles que se van a enviar
        console.log('Detalles a enviar:', detallesConIdVenta);

        // Enviar los detalles de venta con el ID de venta correcto
        this.ventaService.registrarDetalles(detallesConIdVenta).subscribe({
          next: response => {
            console.log('Detalles de venta registrados:', response);
            if (generarTicket) {
              this.generarTicket(idVenta); // Usar el ID de venta generado
            }
          },
          error: error => {
            console.error('Error al registrar los detalles de la venta:', error);
          }
        });
      },
      error: error => {
        console.error('Error al registrar la venta:', error);
      }
    });
  }

  vaciarVenta() {
    this.ventaProductos = [];
    this.subtotal = 0;
    this.totalVenta = 0;
    this.cantidadTotal = 0;
    this.recibido = 0;
    this.formaPago = '';
  }

  generarTicket(idVenta: string) {
    const doc = new jsPDF();
    console.log('Generando ticket para la venta con ID:', idVenta);
    doc.text(`Total: ${this.totalVenta}`, 10, 20);
    doc.text(`Descuento: ${this.subtotal - this.totalVenta}`, 10, 30);
    doc.text(`Recibido: ${this.recibido}`, 10, 40);
    doc.text(`Cambio: ${this.cambio}`, 10, 50);

    // Usa el método autoTable del objeto jsPDF
    autoTable(doc, {
      startY: 80,
      head: [['Código', 'Producto', 'Cantidad', 'Precio']],
      body: this.ventaProductos.map(p => [p.codigo_Barras.toString(), p.nombre, (p.cantidad ?? 0).toString(), p.precio_Venta.toString()])
    });

    doc.save('ticket.pdf');
  }

  aplicarDescuento() {
    let descuento = 0;

    if (this.tipoDescuento !== '0') {
      if (this.tipoDescuento === 'custom' && this.descuentoPersonalizado > 0) {
        descuento = this.subtotal * (this.descuentoPersonalizado / 100);
      } else {
        descuento = this.subtotal * (parseInt(this.tipoDescuento) / 100);
      }
    }

    this.totalVenta = this.subtotal - descuento;
  }


toggleDropdown(key: string) {
  // Primero, cerrar cualquier otro desplegable que esté abierto
  for (const dropdownKey in this.dropdownOpen) {
    if (dropdownKey !== key) {
      this.dropdownOpen[dropdownKey] = false;
    }
  }
  // Alternar el estado del desplegable actual
  this.dropdownOpen[key] = !this.dropdownOpen[key];
}
}